from dataclasses import dataclass

@dataclass(slots=True)
class RetrievalConfig:
    enable_hybrid_search: bool = True
    enable_reranker: bool = True
    enable_hyde: bool = True
    enable_chunk_stitching: bool = True

    candidate_pool_size: int = 30
    final_top_k: int = 5
    vector_distance_cutoff: float = 0.85

    bm25_top_k: int = 30
    rrf_k: int = 60
    vector_weight: float = 1.0
    bm25_weight: float = 0.8
    reranker_model: str = "BAAI/bge-reranker-base"
