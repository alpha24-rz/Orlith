import logging
import asyncio
from typing import List, Dict, Any
from models.document import Document
from models.workspace import Workspace
from services.context import PipelineContext
from core.config import settings

logger = logging.getLogger(__name__)

class ChunkingService:
    async def chunk(
        self, 
        pages: List[Dict], 
        document: Document, 
        workspace: Workspace, 
        ctx: PipelineContext,
        embedding_provider: Any = None,
        model_name: str = None
    ) -> List[Dict]:
        ctx.transition("chunking")
        start_time = asyncio.get_event_loop().time()
        
        is_markdown = (
            document.file_type == "text/markdown"
            or document.file_path.lower().endswith((".md", ".markdown"))
        )
        
        chunks = []
        if settings.ENABLE_PARENT_CHILD_CHUNKING:
            # Parent-Child Chunking flow
            if not is_markdown and settings.ENABLE_SEMANTIC_CHUNKING and embedding_provider:
                try:
                    from services.chunking import SemanticSimilaritySplitter, add_window_parent_context
                    logger.info(f"Attempting semantic similarity parent-child chunking for {document.filename}")
                    semantic_splitter = SemanticSimilaritySplitter(
                        chunk_size=settings.CHILD_CHUNK_SIZE,
                        chunk_overlap=settings.CHILD_CHUNK_OVERLAP,
                    )
                    raw_chunks = await semantic_splitter.split_pages_semantic(
                        pages, embedding_provider, model_name
                    )
                    chunks = add_window_parent_context(raw_chunks)
                except Exception as e:
                    logger.exception(f"Semantic similarity parent-child chunking failed, falling back to structural hierarchical: {e}")

            if not chunks:
                from services.chunking import split_pages_hierarchical
                logger.info(f"Using structural hierarchical (Parent-Child) chunking for {document.filename}")
                chunks = split_pages_hierarchical(
                    pages,
                    child_size=settings.CHILD_CHUNK_SIZE,
                    parent_size=settings.PARENT_CHUNK_SIZE,
                    child_overlap=settings.CHILD_CHUNK_OVERLAP,
                    is_markdown=is_markdown
                )
        else:
            # Legacy/Normal Chunking flow
            if not is_markdown and settings.ENABLE_SEMANTIC_CHUNKING and embedding_provider:
                try:
                    from services.chunking import SemanticSimilaritySplitter
                    logger.info(f"Attempting semantic similarity chunking for {document.filename}")
                    semantic_splitter = SemanticSimilaritySplitter(
                        chunk_size=settings.CHUNK_SIZE,
                        chunk_overlap=settings.CHUNK_OVERLAP,
                    )
                    chunks = await semantic_splitter.split_pages_semantic(
                        pages, embedding_provider, model_name
                    )
                except Exception as e:
                    logger.exception(f"Semantic similarity chunking failed for {document.filename}, falling back to structural splitter: {e}")
                    
            if not chunks:
                from services.chunking import StructuralTextSplitter
                logger.info(f"Using structural text splitter for {document.filename}")
                splitter = StructuralTextSplitter(
                    chunk_size=settings.CHUNK_SIZE,
                    chunk_overlap=settings.CHUNK_OVERLAP,
                    is_markdown=is_markdown,
                )
                chunks = splitter.split_pages(pages)
        
        elapsed = asyncio.get_event_loop().time() - start_time
        ctx.record("chunking_time", elapsed)
        ctx.metrics["chunk_count"] = len(chunks)
        
        return chunks
