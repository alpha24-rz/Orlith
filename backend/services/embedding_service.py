import logging
import asyncio
from typing import List, Dict, Any
from models.document import Document
from models.workspace import Workspace
from services.context import PipelineContext
from sqlalchemy.ext.asyncio import AsyncSession
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception
from httpx import HTTPStatusError, ConnectError, TimeoutException
from core.chroma import get_workspace_collection
from models.chunk import Chunk, ChunkEmbedding
from sqlalchemy import delete

logger = logging.getLogger(__name__)

def is_transient_error(e):
    if isinstance(e, HTTPStatusError):
        return e.response.status_code in (429, 502, 503, 504)
    return isinstance(e, (ConnectError, TimeoutException, ConnectionError))

class EmbeddingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception(is_transient_error),
        before_sleep=lambda rs: logger.warning(f"Transient error, retrying embedding #{rs.attempt_number}...")
    )
    async def embed_and_store(
        self, 
        document: Document, 
        chunks: List[Dict], 
        workspace: Workspace, 
        ctx: PipelineContext,
        embedding_provider: Any,
        model_name: str,
        provider_name: str
    ):
        if not chunks:
            raise ValueError("No chunks to embed.")
            
        ctx.transition("embedding")
        start_time = asyncio.get_event_loop().time()

        # 1. Clean existing PostgreSQL chunks for this document
        await self.db.execute(delete(Chunk).where(Chunk.document_id == document.id))
        await self.db.commit()

        collection = get_workspace_collection(document.workspace_id)
        try:
            await asyncio.to_thread(collection.delete, where={"document_id": document.id})
        except Exception:
            pass  # Ignore if not found

        texts_to_embed = [c["text"] for c in chunks]
        
        # API Call
        embeddings = await embedding_provider.embed(texts_to_embed, model_name)
        
        api_elapsed = asyncio.get_event_loop().time() - start_time
        ctx.record("embedding_time", api_elapsed)
        
        ctx.transition("storing")
        io_start = asyncio.get_event_loop().time()

        # Prepare for Chroma
        ids = [f"{document.id}_{c['chunk_index']}" for c in chunks]
        metadatas = [
            {
                "document_id": document.id,
                "filename": document.filename,
                "page_number": c["page_number"],
                "chunk_index": c["chunk_index"],
                "parent_content": c.get("parent_content", ""),
            }
            for c in chunks
        ]
        await asyncio.to_thread(
            collection.add,
            ids=ids, embeddings=embeddings, metadatas=metadatas, documents=texts_to_embed
        )

        # 2. Store in PostgreSQL
        db_chunks = []
        for i, c in enumerate(chunks):
            chunk_obj = Chunk(
                document_id=document.id,
                content=c["text"],
                page_number=c["page_number"],
                section=c.get("section"),
                chunk_index=c["chunk_index"],
                token_count=c.get("token_count", 0),
                parent_content=c.get("parent_content"),
            )
            self.db.add(chunk_obj)
            db_chunks.append((chunk_obj, embeddings[i]))
            
        await self.db.commit() 
        
        for chunk_obj, emb in db_chunks:
            emb_obj = ChunkEmbedding(
                chunk_id=chunk_obj.id,
                provider=provider_name,
                model=model_name,
                dimension=len(emb),
                embedding=emb
            )
            self.db.add(emb_obj)
            
        await self.db.commit()
        
        io_elapsed = asyncio.get_event_loop().time() - io_start
        ctx.record("storage_time", io_elapsed)
