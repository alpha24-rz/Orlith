import math

def calculate_mrr(rank: int) -> float:
    """Mean Reciprocal Rank"""
    if rank <= 0:
        return 0.0
    return 1.0 / rank

def calculate_recall_at_k(rank: int, k: int) -> int:
    """Recall at K (1 if expected chunk is within top K, else 0)"""
    if 0 < rank <= k:
        return 1
    return 0

def calculate_ndcg(rank: int, k: int = None) -> float:
    """
    Normalized Discounted Cumulative Gain.
    For a single relevant item, DCG = 1/log2(rank+1).
    Since IDCG = 1/log2(1+1) = 1, nDCG = DCG/IDCG = DCG.
    """
    if rank <= 0:
        return 0.0
    if k is not None and rank > k:
        return 0.0
    return 1.0 / math.log2(rank + 1)
