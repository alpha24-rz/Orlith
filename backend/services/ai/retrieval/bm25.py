import logging
import asyncio
from typing import List, Dict, Tuple
from rank_bm25 import BM25Okapi
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.chroma import get_workspace_collection
from models import Document
from services.ai.retrieval.tokenizer import tokenize_for_bm25

logger = logging.getLogger(__name__)

# Cache: workspace_id -> {"state_hash": int, "index": BM25Okapi, "chunks": list}
_bm25_cache = {}

async def _get_corpus_state_hash(workspace_id: str, db: AsyncSession) -> int:
    stmt = select(Document.id, Document.status, Document.content_hash).where(Document.workspace_id == workspace_id)
    result = await db.execute(stmt)
    docs = result.all()
    # Frozenset makes order irrelevant
    return hash(frozenset(docs))

def _build_index_sync(documents: list, metadatas: list) -> Tuple[BM25Okapi, list]:
    tokenized_corpus = [tokenize_for_bm25(doc) for doc in documents]
    bm25 = BM25Okapi(tokenized_corpus)
    
    chunks = []
    for doc, meta in zip(documents, metadatas):
        chunks.append({
            "text": doc,
            "meta": meta
        })
    return bm25, chunks

async def get_bm25_index(workspace_id: str, db: AsyncSession) -> Tuple[BM25Okapi, list, bool]:
    """Returns BM25Okapi index, chunks list, and a cache_hit boolean."""
    state_hash = await _get_corpus_state_hash(workspace_id, db)
    
    cached = _bm25_cache.get(workspace_id)
    if cached and cached["state_hash"] == state_hash:
        return cached["index"], cached["chunks"], True
        
    logger.info(f"Building local BM25 index for workspace {workspace_id}")
    collection = get_workspace_collection(workspace_id)
    
    # We must run collection.get() in thread because it can be blocking
    data = await asyncio.to_thread(collection.get, include=["documents", "metadatas"])
    
    documents = data.get("documents", [])
    metadatas = data.get("metadatas", [])
    
    if not documents:
        return None, [], False
        
    bm25, chunks = await asyncio.to_thread(_build_index_sync, documents, metadatas)
    
    _bm25_cache[workspace_id] = {
        "state_hash": state_hash,
        "index": bm25,
        "chunks": chunks
    }
    
    return bm25, chunks, False

async def retrieve_bm25(workspace_id: str, query: str, top_k: int, db: AsyncSession) -> Tuple[List[Dict], bool, int]:
    """
    Returns (results, cache_hit, document_count)
    """
    bm25, chunks, cache_hit = await get_bm25_index(workspace_id, db)
    if not bm25:
        return [], cache_hit, 0
        
    tokenized_query = tokenize_for_bm25(query)
    
    # Run scoring in thread
    def _score():
        return bm25.get_scores(tokenized_query)
        
    scores = await asyncio.to_thread(_score)
    
    results = []
    for i, score in enumerate(scores):
        if score > 0:
            c = chunks[i]
            results.append({
                "text": c["text"],
                "score": float(score),
                "meta": c["meta"]
            })
            
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:top_k], cache_hit, len(chunks)
