from dataclasses import dataclass

@dataclass(slots=True)
class RetrievalConfig:
    enable_hybrid_search: bool = True
    enable_reranker: bool = True

    candidate_pool_size: int = 30
    final_top_k: int = 5

    bm25_top_k: int = 30
    rrf_k: int = 60
    reranker_model: str = "BAAI/bge-reranker-base"
