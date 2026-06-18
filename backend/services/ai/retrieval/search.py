import logging
from typing import List, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models import Workspace, Document
from core.chroma import get_workspace_collection
from services.ai.gateway import LLMGateway
from services.query_rewriter import rewrite_query
import time
import asyncio
from services.ai.retrieval.config import RetrievalConfig
from services.ai.retrieval.reranker import execute_rerank

logger = logging.getLogger(__name__)

async def retrieve(
    workspace: Workspace,
    query: str,
    db: AsyncSession,
    top_k: int = 8,
    enable_rewriting: bool = True,
    override_endpoint_id: Optional[str] = None,
    override_model: Optional[str] = None,
) -> List[Dict]:
    """Base retrieval hook."""
    gateway = LLMGateway(db)
    try:
        embedding_provider, embed_model = await gateway.get_embedding_provider(workspace)
        chat_adapter, chat_model = await gateway.get_chat_provider(
            workspace, override_endpoint_id, override_model
        )
    except Exception as e:
        logger.error(f"Error setting up RAG providers: {e}")
        return []

    # 1. Query Rewriting (multi-query expansion)
    queries_to_embed = [query]
    if enable_rewriting:
        try:
            queries_to_embed = await rewrite_query(
                query, chat_adapter, chat_model, num_variants=2, db=db, workspace_id=workspace.id
            )
        except Exception as e:
            logger.warning(f"Query rewriting skipped during retrieval: {e}")
            queries_to_embed = [query]

    # 2. Embed queries
    try:
        all_embeddings = await embedding_provider.embed(queries_to_embed, embed_model)
    except Exception as e:
        logger.error(f"Embedding query failed: {e}")
        return []

    collection = get_workspace_collection(workspace.id)

    # 3. Query ChromaDB and merge/dedup results
    # TODO: This multi-query merge strategy sorts purely by raw cosine distance.
    # It should eventually be replaced by Reciprocal Rank Fusion (RRF).
    seen_texts: set = set()
    all_valid_chunks: List[Dict] = []

    for query_embedding in all_embeddings:
        try:
            results = collection.query(
                query_embeddings=[query_embedding],
                n_results=top_k,
            )
        except Exception as e:
            logger.warning(f"ChromaDB query failed for query variant: {e}")
            continue

        if not (results and results.get("documents") and results["documents"]):
            continue

        docs = results["documents"][0]
        distances = (
            results["distances"][0]
            if results.get("distances") and results["distances"]
            else [1.0] * len(docs)
        )
        metadatas = (
            results["metadatas"][0]
            if results.get("metadatas") and results["metadatas"]
            else [{}] * len(docs)
        )

        for doc_text, distance, meta in zip(docs, distances, metadatas):
            # Cosine distance <= 0.35 means similarity >= 0.65
            if distance <= 0.35 and doc_text not in seen_texts:
                seen_texts.add(doc_text)
                all_valid_chunks.append({
                    "text": doc_text,
                    "distance": distance,
                    "meta": meta,
                })

    # Sort all merged chunks by relevance (distance ascending)
    all_valid_chunks.sort(key=lambda x: x["distance"])
    return all_valid_chunks[:top_k]

async def rerank(query: str, candidates: List[Dict]) -> List[Dict]:
    """
    Rerank hook. Currently a pass-through.
    In Phase 3, this will use BGE/Cohere/Jina rerankers.
    """
    return candidates

async def build_context(reranked_chunks: List[Dict]) -> str:
    """
    Context Builder hook. Formats the chunks into a structured context block with citations.
    """
    if not reranked_chunks:
        return ""
        
    context_blocks = []
    for chunk in reranked_chunks:
        meta = chunk.get("meta", {})
        text = chunk.get("text", "")
        
        source = meta.get("filename", "Unknown")
        page = meta.get("page_number", "?")
        section = meta.get("section", "")
        
        block = f"[Source: {source}, Page: {page}"
        if section:
            block += f", Section: {section}"
        block += f"]\n{text}\n"
        
        context_blocks.append(block)
        
    return "\n".join(context_blocks)

async def retrieve_relevant_chunks(
    workspace_id: str,
    query: str,
    db: AsyncSession,
    top_k: int = None,
    enable_rewriting: bool = True,
    override_endpoint_id: str = None,
    override_model: str = None,
    retrieval_config: RetrievalConfig = None,
) -> List[Dict]:
    """
    Full pipeline: query rewrite -> ChromaDB -> cross encoder reranking.
    Configurable via retrieval_config.
    """
    from models import Workspace
    workspace = await db.get(Workspace, workspace_id)
    if not workspace:
        logger.warning(f"Workspace {workspace_id} not found during retrieval")
        return []

    if retrieval_config is None:
        # Fallback to defaults if not provided
        retrieval_config = RetrievalConfig()
        
    candidate_pool_size = retrieval_config.candidate_pool_size
    final_top_k = top_k if top_k is not None else retrieval_config.final_top_k

    t1 = time.time()
    
    tasks = [
        retrieve(workspace, query, db, candidate_pool_size, enable_rewriting, override_endpoint_id, override_model)
    ]
    
    if retrieval_config.enable_hybrid_search:
        from services.ai.retrieval.bm25 import retrieve_bm25
        tasks.append(retrieve_bm25(workspace.id, query, retrieval_config.bm25_top_k, db))
        
    results = await asyncio.gather(*tasks)
    
    candidates = results[0]
    bm25_candidates = []
    bm25_cache_hit = False
    bm25_doc_count = 0
    
    if retrieval_config.enable_hybrid_search:
        bm25_candidates, bm25_cache_hit, bm25_doc_count = results[1]
        
    t2 = time.time()
    
    # Fusion
    t2_fusion = time.time()
    fused_candidates = candidates
    if retrieval_config.enable_hybrid_search:
        from services.ai.retrieval.fusion import reciprocal_rank_fusion
        fused_candidates = reciprocal_rank_fusion(candidates, bm25_candidates, rrf_k=retrieval_config.rrf_k)
        # Limit the fused pool to the cross encoder
        fused_candidates = fused_candidates[:candidate_pool_size]
    t3_fusion = time.time()
    
    # Reranking
    t3 = time.time()
    fallback_used = False
    reranked = fused_candidates
    if retrieval_config.enable_reranker:
        try:
            from services.ai.retrieval.reranker import execute_rerank
            reranked = await execute_rerank(query, fused_candidates, retrieval_config.reranker_model)
        except Exception as e:
            logger.warning(f"Reranking failed: {e}. Falling back to ChromaDB/RRF distance.")
            fallback_used = True
    
    reranked = reranked[:final_top_k]
    t4 = time.time()
    
    logger.info(
        "Retrieval complete",
        extra={
            "retrieval_latency": round(t2 - t1, 4),
            "rrf_latency": round(t3_fusion - t2_fusion, 4) if retrieval_config.enable_hybrid_search else 0.0,
            "reranking_latency": round(t4 - t3, 4),
            "vector_candidate_count": len(candidates),
            "bm25_candidate_count": len(bm25_candidates),
            "rrf_candidate_count": len(fused_candidates),
            "final_chunk_count": len(reranked),
            "bm25_document_count": bm25_doc_count,
            "cache_hit": bm25_cache_hit if retrieval_config.enable_hybrid_search else None,
            "cache_miss": not bm25_cache_hit if retrieval_config.enable_hybrid_search else None,
            "hybrid_enabled": retrieval_config.enable_hybrid_search,
            "reranker_enabled": retrieval_config.enable_reranker,
            "reranker_model": retrieval_config.reranker_model,
            "fallback_used": fallback_used
        }
    )
    
    return reranked

async def semantic_search_docs(
    workspace_id: str,
    query: str,
    top_k: int,
    db: AsyncSession,
) -> List[Dict]:
    """
    Format semantic search hits from ChromaDB with document record metadata (used by /query/search endpoint).
    """
    workspace = await db.get(Workspace, workspace_id)
    if not workspace:
        return []

    chunks = await retrieve_relevant_chunks(
        workspace_id=workspace_id,
        query=query,
        db=db,
        top_k=top_k,
        enable_rewriting=True
    )

    if not chunks:
        return []

    doc_ids = list({c["meta"].get("document_id") for c in chunks if c["meta"].get("document_id")})
    doc_map: Dict[str, Document] = {}
    if doc_ids:
        db_result = await db.execute(
            select(Document).where(Document.id.in_(doc_ids))
        )
        for doc in db_result.scalars().all():
            doc_map[doc.id] = doc

    all_hits = []
    for chunk in chunks:
        meta = chunk["meta"]
        text = chunk["text"]

        if "distance" in chunk:
            similarity = max(0.0, min(1.0, 1.0 - chunk["distance"]))
        elif "reranker_score" in chunk:
            similarity = max(0.0, min(1.0, chunk["reranker_score"]))
        elif "rrf_score" in chunk:
            similarity = max(0.0, min(1.0, chunk["rrf_score"] * 30))
        else:
            similarity = 0.5
        doc_id = meta.get("document_id", "")
        doc_record = doc_map.get(doc_id)
        doc_type = (
            meta.get("filename", "").split(".")[-1].upper()
            if meta.get("filename")
            else "PDF"
        )

        all_hits.append({
            "docId": doc_id,
            "docName": meta.get("filename", "Unknown"),
            "docType": doc_type,
            "workspace": workspace.name,
            "workspaceId": workspace_id,
            "page": meta.get("page_number", 1),
            "relevance": round(similarity, 4),
            "snippet": text[:300] + "..." if len(text) > 300 else text,
            "matchType": "semantic",
            "uploadedAt": doc_record.created_at.isoformat() if doc_record else None,
        })

    return all_hits
