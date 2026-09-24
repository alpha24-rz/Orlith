from typing import List, Dict, Tuple, Optional
from services.ai.retrieval.utils import build_chunk_uid


def get_chunk_uid(chunk: Dict) -> str:
    meta = chunk.get("meta", {})
    doc_id = meta.get("document_id")
    chunk_idx = meta.get("chunk_index")
    if doc_id is not None and chunk_idx is not None:
        return build_chunk_uid(doc_id, chunk_idx)
    # Fallback to normalized text signature
    text = chunk.get("text", "")
    return text[:100] if text else str(id(chunk))


def multi_list_rrf(
    ranked_lists_with_weights: List[Tuple[List[Dict], float]],
    rrf_k: int = 60,
) -> List[Dict]:
    """
    Fuses multiple ranked lists with list-specific weights using Reciprocal Rank Fusion.
    Score(d) = sum( weight * (1.0 / (rrf_k + rank)) ) for each list where d appears.
    """
    scores = {}
    chunk_map = {}
    appearance_counts = {}

    for candidates, weight in ranked_lists_with_weights:
        if not candidates or weight <= 0:
            continue
        for rank, chunk in enumerate(candidates, start=1):
            uid = get_chunk_uid(chunk)
            score_delta = weight * (1.0 / (rrf_k + rank))
            scores[uid] = scores.get(uid, 0.0) + score_delta
            appearance_counts[uid] = appearance_counts.get(uid, 0) + 1

            if uid not in chunk_map:
                chunk_map[uid] = chunk.copy()
            else:
                existing = chunk_map[uid]
                if "distance" in chunk and (
                    "distance" not in existing or chunk["distance"] < existing["distance"]
                ):
                    existing["distance"] = chunk["distance"]
                if "score" in chunk and (
                    "score" not in existing or chunk["score"] > existing["score"]
                ):
                    existing["score"] = chunk["score"]

    fused = []
    for uid, rrf_score in scores.items():
        c = chunk_map[uid].copy()
        c["rrf_score"] = rrf_score
        c["rrf_appearances"] = appearance_counts.get(uid, 1)
        fused.append(c)

    fused.sort(key=lambda x: x["rrf_score"], reverse=True)
    return fused


def reciprocal_rank_fusion(
    vector_candidates: List[Dict],
    bm25_candidates: List[Dict],
    rrf_k: int = 60,
    vector_weight: float = 1.0,
    bm25_weight: float = 0.8,
) -> List[Dict]:
    """
    Backward-compatible wrapper for fusing vector search and BM25 search.
    """
    return multi_list_rrf(
        [
            (vector_candidates, vector_weight),
            (bm25_candidates, bm25_weight),
        ],
        rrf_k=rrf_k,
    )
