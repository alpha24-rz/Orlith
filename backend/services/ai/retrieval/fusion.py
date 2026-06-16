from typing import List, Dict
from services.ai.retrieval.utils import build_chunk_uid

def reciprocal_rank_fusion(vector_candidates: List[Dict], bm25_candidates: List[Dict], rrf_k: int = 60) -> List[Dict]:
    """
    Fuses two ranked lists using Reciprocal Rank Fusion.
    Score = sum(1 / (RRF_K + rank)) for each chunk.
    """
    scores = {}
    chunk_map = {}
    
    def get_uid(chunk):
        meta = chunk.get("meta", {})
        doc_id = meta.get("document_id")
        chunk_idx = meta.get("chunk_index")
        if doc_id is not None and chunk_idx is not None:
            return build_chunk_uid(doc_id, chunk_idx)
        return chunk.get("text", "")
    
    for rank, chunk in enumerate(vector_candidates, start=1):
        uid = get_uid(chunk)
        scores[uid] = scores.get(uid, 0.0) + 1.0 / (rrf_k + rank)
        if uid not in chunk_map:
            chunk_map[uid] = chunk
            
    for rank, chunk in enumerate(bm25_candidates, start=1):
        uid = get_uid(chunk)
        scores[uid] = scores.get(uid, 0.0) + 1.0 / (rrf_k + rank)
        if uid not in chunk_map:
            chunk_map[uid] = chunk
            
    fused = []
    for uid, rrf_score in scores.items():
        c = chunk_map[uid].copy()
        c["rrf_score"] = rrf_score
        fused.append(c)
        
    fused.sort(key=lambda x: x["rrf_score"], reverse=True)
    return fused
