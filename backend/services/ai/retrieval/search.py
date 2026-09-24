from __future__ import annotations
import logging
from typing import List, Dict, Optional, Tuple, TYPE_CHECKING
import time
import asyncio
import re
import math

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession
    from models import Workspace, Document

from services.query_rewriter import rewrite_query, generate_hyde_passage, extract_search_keywords
from services.ai.retrieval.config import RetrievalConfig
from services.ai.retrieval.fusion import multi_list_rrf, reciprocal_rank_fusion, get_chunk_uid
from services.ai.retrieval.reranker import execute_rerank

logger = logging.getLogger(__name__)


def normalize_filename(filename: str) -> str:
    if not filename:
        return ""
    base = filename.rsplit(".", 1)[0]
    base = re.sub(r'[-_\s]+v\d+$', '', base, flags=re.IGNORECASE)
    base = re.sub(r'[-_\s]+version[-_\s]*\d+$', '', base, flags=re.IGNORECASE)
    base = re.sub(r'\s*\(\d+\)$', '', base)
    return base.lower().strip()


def coalesce_adjacent_chunks(chunks: List[Dict]) -> List[Dict]:
    """
    Neighbor Chunk Stitching:
    When consecutive chunks from the same document (e.g. index i and i+1) are retrieved,
    stitch them together into a contiguous context window to preserve narrative flow.
    """
    if len(chunks) <= 1:
        return chunks

    # Group by document_id while preserving order
    stitched: List[Dict] = []
    i = 0
    n = len(chunks)

    while i < n:
        curr = chunks[i].copy()
        curr_meta = curr.get("meta") or {}
        curr_doc_id = curr_meta.get("document_id")
        curr_idx = curr_meta.get("chunk_index")

        # Attempt to stitch with immediately following chunks in the list if adjacent
        j = i + 1
        while j < n:
            next_chunk = chunks[j]
            next_meta = next_chunk.get("meta") or {}
            next_doc_id = next_meta.get("document_id")
            next_idx = next_meta.get("chunk_index")

            if (
                curr_doc_id
                and curr_doc_id == next_doc_id
                and curr_idx is not None
                and next_idx is not None
                and next_idx == curr_idx + 1
            ):
                # Adjacent chunk found! Stitch text
                curr["text"] = curr.get("text", "").strip() + "\n\n" + next_chunk.get("text", "").strip()
                
                # Combine parent content if available
                if next_meta.get("parent_content") and not curr_meta.get("parent_content"):
                    curr["parent_content"] = next_meta.get("parent_content")

                # Combine page numbers if they differ
                curr_page = curr_meta.get("page_number", 1)
                next_page = next_meta.get("page_number", 1)
                if curr_page != next_page:
                    curr_meta["page_number"] = f"{curr_page}-{next_page}"

                # Retain best relevance score
                if "relevance_score" in next_chunk:
                    curr["relevance_score"] = max(
                        curr.get("relevance_score", 0.0), next_chunk["relevance_score"]
                    )
                if "rerank_score" in next_chunk:
                    curr["rerank_score"] = max(
                        curr.get("rerank_score", -999.0), next_chunk["rerank_score"]
                    )

                curr["meta"] = curr_meta
                curr_idx = next_idx
                j += 1
            else:
                break

        stitched.append(curr)
        i = j

    return stitched


async def retrieve(
    workspace: Workspace,
    query: str,
    db: AsyncSession,
    top_k: int = 8,
    enable_rewriting: bool = True,
    override_endpoint_id: Optional[str] = None,
    override_model: Optional[str] = None,
    retrieval_config: Optional[RetrievalConfig] = None,
) -> List[Dict]:
    """
    Advanced dense vector retrieval:
    1. Multilingual query expansion + HyDE (Hypothetical Document Embeddings).
    2. ChromaDB dense vector queries with adaptive cutoff (no premature 0.35 drop).
    3. Multi-query Reciprocal Rank Fusion across query variations.
    """
    if retrieval_config is None:
        retrieval_config = RetrievalConfig()

    from services.ai.gateway import LLMGateway
    from core.chroma import get_workspace_collection

    gateway = LLMGateway(db)
    try:
        embedding_provider, embed_model = await gateway.get_embedding_provider(workspace)
        chat_adapter, chat_model = await gateway.get_chat_provider(
            workspace, override_endpoint_id, override_model
        )
    except Exception as e:
        logger.error(f"Error setting up RAG providers: {e}")
        return []

    # 1. Multi-Query Expansion & HyDE
    queries_to_embed = [query]
    query_weights = [1.0]

    if enable_rewriting:
        try:
            expanded = await rewrite_query(
                query, chat_adapter, chat_model, num_variants=2, db=db, workspace_id=workspace.id
            )
            for q_var in expanded:
                if q_var != query and q_var not in queries_to_embed:
                    queries_to_embed.append(q_var)
                    query_weights.append(0.80)
        except Exception as e:
            logger.warning(f"Query rewriting skipped during retrieval: {e}")

        # HyDE passage generation
        if retrieval_config.enable_hyde:
            try:
                hyde_passage = await generate_hyde_passage(
                    query, chat_adapter, chat_model, db=db, workspace_id=workspace.id
                )
                if hyde_passage:
                    queries_to_embed.append(hyde_passage)
                    query_weights.append(0.90)
                    logger.info("HyDE passage generated and included in dense retrieval pool")
            except Exception as e:
                logger.warning(f"HyDE generation skipped: {e}")

    # 2. Embed queries in batch
    try:
        all_embeddings = await embedding_provider.embed(queries_to_embed, embed_model)
    except Exception as e:
        logger.error(f"Embedding query failed: {e}")
        return []

    collection = get_workspace_collection(workspace.id)
    distance_cutoff = retrieval_config.vector_distance_cutoff

    # 3. Query ChromaDB per query variant and collect ranked candidate lists
    per_query_ranked_lists: List[Tuple[List[Dict], float]] = []

    for query_embedding, weight in zip(all_embeddings, query_weights):
        try:
            results = collection.query(
                query_embeddings=[query_embedding],
                n_results=top_k,
            )
        except Exception as e:
            logger.warning(f"ChromaDB query failed for variant: {e}")
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

        variant_candidates = []
        for doc_text, distance, meta in zip(docs, distances, metadatas):
            # Safe distance threshold (default <= 0.85)
            if distance <= distance_cutoff:
                variant_candidates.append({
                    "text": doc_text,
                    "distance": distance,
                    "meta": meta,
                    "parent_content": meta.get("parent_content", ""),
                })

        if variant_candidates:
            # Sort within this variant by distance ascending
            variant_candidates.sort(key=lambda x: x["distance"])
            per_query_ranked_lists.append((variant_candidates, weight))

    if not per_query_ranked_lists:
        return []

    # 4. Fuse all query variants via Reciprocal Rank Fusion (RRF)
    fused_vector_candidates = multi_list_rrf(
        per_query_ranked_lists, rrf_k=retrieval_config.rrf_k
    )

    return fused_vector_candidates[:top_k]


async def build_context(reranked_chunks: List[Dict]) -> str:
    """
    Context Builder hook. Formats the chunks into a structured context block with citations,
    utilizing parent_content when available.
    """
    if not reranked_chunks:
        return ""

    context_blocks = []
    for idx, chunk in enumerate(reranked_chunks, start=1):
        meta = chunk.get("meta", {})
        text = chunk.get("parent_content") or meta.get("parent_content") or chunk.get("text", "")

        source = meta.get("filename", "Unknown")
        page = meta.get("page_number", "?")
        section = meta.get("section", "")

        block = f"[{idx}] Dokumen: {source}, Halaman: {page}"
        if section:
            block += f", Bagian: {section}"
        block += f"\n{text.strip()}\n"

        context_blocks.append(block)

    return "\n---\n".join(context_blocks)


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
    SOTA Hybrid RAG 2.0 Pipeline:
    1. Multilingual Query Expansion + HyDE.
    2. Dense Vector Search (ChromaDB) + Sparse Lexical Search (BM25 with entity boost).
    3. Multi-Query & Hybrid Reciprocal Rank Fusion (RRF).
    4. Cross-Encoder Reranking with calibrated score distribution.
    5. Neighbor Chunk Stitching (Coalescing).
    6. Robust Chunk Deduplication.
    """
    from models import Workspace
    workspace = await db.get(Workspace, workspace_id)
    if not workspace:
        logger.warning(f"Workspace {workspace_id} not found during retrieval")
        return []

    if retrieval_config is None:
        retrieval_config = RetrievalConfig()

    candidate_pool_size = retrieval_config.candidate_pool_size
    final_top_k = top_k if top_k is not None else retrieval_config.final_top_k

    t1 = time.time()

    # Step 1: Dense Vector Retrieval (multi-query + HyDE)
    tasks = [
        retrieve(
            workspace,
            query,
            db,
            candidate_pool_size,
            enable_rewriting,
            override_endpoint_id,
            override_model,
            retrieval_config,
        )
    ]

    # Step 2: Sparse Lexical Retrieval (BM25)
    if retrieval_config.enable_hybrid_search:
        from services.ai.retrieval.bm25 import retrieve_bm25
        # Enhance BM25 query with high-value entities/numbers if present
        keywords = extract_search_keywords(query)
        bm25_query = query + (" " + " ".join(keywords) if keywords else "")
        tasks.append(retrieve_bm25(workspace.id, bm25_query, retrieval_config.bm25_top_k, db))

    results = await asyncio.gather(*tasks)

    candidates = results[0]
    bm25_candidates = []
    bm25_cache_hit = False
    bm25_doc_count = 0

    if retrieval_config.enable_hybrid_search:
        bm25_candidates, bm25_cache_hit, bm25_doc_count = results[1]

    t2 = time.time()

    # Step 3: Hybrid Reciprocal Rank Fusion
    t2_fusion = time.time()
    fused_candidates = candidates
    if retrieval_config.enable_hybrid_search and bm25_candidates:
        fused_candidates = reciprocal_rank_fusion(
            vector_candidates=candidates,
            bm25_candidates=bm25_candidates,
            rrf_k=retrieval_config.rrf_k,
            vector_weight=retrieval_config.vector_weight,
            bm25_weight=retrieval_config.bm25_weight,
        )
    
    # Cap candidate pool for reranker
    fused_candidates = fused_candidates[:candidate_pool_size]
    t3_fusion = time.time()

    # Step 4: Cross-Encoder Reranking
    t3 = time.time()
    fallback_used = False
    reranked = fused_candidates
    if retrieval_config.enable_reranker and fused_candidates:
        try:
            reranked = await execute_rerank(query, fused_candidates, retrieval_config.reranker_model)
        except Exception as e:
            logger.warning(f"Reranking failed: {e}. Falling back to ChromaDB/RRF distance.")
            fallback_used = True
            # Calibrate fallback relevance scores from RRF
            for c in reranked:
                if "relevance_score" not in c:
                    rrf = c.get("rrf_score", 0.0)
                    c["relevance_score"] = round(max(0.40, min(0.98, rrf * 32)), 4)
    else:
        # Calibrate relevance scores if reranker is not enabled
        for c in reranked:
            if "relevance_score" not in c:
                rrf = c.get("rrf_score", 0.0)
                if rrf > 0:
                    c["relevance_score"] = round(max(0.40, min(0.98, rrf * 32)), 4)
                elif "distance" in c:
                    c["relevance_score"] = round(max(0.0, min(1.0, 1.0 - c["distance"])), 4)
                else:
                    c["relevance_score"] = 0.70

    # Step 5: Neighbor Chunk Stitching (Coalescing)
    if retrieval_config.enable_chunk_stitching:
        reranked = coalesce_adjacent_chunks(reranked)

    # Step 6: Deduplication by chunk UID (Preserves multiple chunks on the same page!)
    deduped_reranked = []
    seen_uids = set()
    seen_text_hashes = set()

    for chunk in reranked:
        uid = get_chunk_uid(chunk)
        # Content fingerprint (first 120 alphanumeric chars)
        text_clean = re.sub(r'\s+', '', chunk.get("text", "").lower())[:120]

        if uid not in seen_uids and text_clean not in seen_text_hashes:
            seen_uids.add(uid)
            if text_clean:
                seen_text_hashes.add(text_clean)
            deduped_reranked.append(chunk)

    final_chunks = deduped_reranked[:final_top_k]
    t4 = time.time()

    logger.info(
        "Retrieval complete (SOTA RAG 2.0)",
        extra={
            "retrieval_latency": round(t2 - t1, 4),
            "rrf_latency": round(t3_fusion - t2_fusion, 4) if retrieval_config.enable_hybrid_search else 0.0,
            "reranking_latency": round(t4 - t3, 4),
            "vector_candidate_count": len(candidates),
            "bm25_candidate_count": len(bm25_candidates),
            "rrf_candidate_count": len(fused_candidates),
            "final_chunk_count": len(final_chunks),
            "bm25_document_count": bm25_doc_count,
            "cache_hit": bm25_cache_hit if retrieval_config.enable_hybrid_search else None,
            "cache_miss": not bm25_cache_hit if retrieval_config.enable_hybrid_search else None,
            "hybrid_enabled": retrieval_config.enable_hybrid_search,
            "reranker_enabled": retrieval_config.enable_reranker,
            "reranker_model": retrieval_config.reranker_model,
            "fallback_used": fallback_used,
            "hyde_enabled": retrieval_config.enable_hyde,
            "stitching_enabled": retrieval_config.enable_chunk_stitching,
        }
    )

    return final_chunks


async def semantic_search_docs(
    workspace_id: str,
    query: str,
    top_k: int,
    db: AsyncSession,
) -> List[Dict]:
    """
    Format search hits with document record metadata (used by /query/search endpoint).
    """
    from sqlalchemy import select
    from models import Workspace, Document

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

    doc_ids = list({c.get("meta", {}).get("document_id") for c in chunks if c.get("meta", {}).get("document_id")})
    doc_map: Dict[str, Document] = {}
    if doc_ids:
        db_result = await db.execute(
            select(Document).where(Document.id.in_(doc_ids))
        )
        for doc in db_result.scalars().all():
            doc_map[doc.id] = doc

    all_hits = []
    for chunk in chunks:
        meta = chunk.get("meta") or {}
        text = chunk.get("text", "")

        similarity = chunk.get("relevance_score")
        if similarity is None:
            if "rerank_score" in chunk:
                similarity = round(1.0 / (1.0 + math.exp(-chunk["rerank_score"])), 4)
            elif "rrf_score" in chunk:
                similarity = round(max(0.40, min(0.98, chunk["rrf_score"] * 32)), 4)
            elif "distance" in chunk:
                similarity = round(max(0.0, min(1.0, 1.0 - chunk["distance"])), 4)
            else:
                similarity = 0.75

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
            "relevance": round(float(similarity), 4),
            "snippet": text[:300] + "..." if len(text) > 300 else text,
            "matchType": "hybrid",
            "uploadedAt": doc_record.created_at.isoformat() if doc_record and doc_record.created_at else None,
        })

    return all_hits

