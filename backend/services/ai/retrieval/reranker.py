import logging
import asyncio
from functools import lru_cache
from typing import List, Dict

logger = logging.getLogger(__name__)

@lru_cache(maxsize=1)
def get_cross_encoder(model_name: str):
    """
    Lazy load and cache the cross-encoder model.
    """
    try:
        from sentence_transformers import CrossEncoder
        logger.info(f"Loading cross-encoder model: {model_name}")
        model = CrossEncoder(model_name)
        return model
    except ImportError:
        logger.error("sentence-transformers not installed. Reranker unavailable.")
        return None
    except Exception as e:
        logger.error(f"Failed to load cross-encoder {model_name}: {e}")
        return None

def _do_rerank(query: str, candidates: List[Dict], model_name: str) -> List[Dict]:
    if not candidates:
        return []
        
    reranker = get_cross_encoder(model_name)
    if not reranker:
        raise RuntimeError("Reranker model could not be loaded")
        
    pairs = [(query, c["text"]) for c in candidates]
    
    # predict returns a list of scores corresponding to each pair
    scores = reranker.predict(pairs)
    
    # Create a new list to avoid mutating the input candidates across thread boundaries
    reranked_candidates = []
    for i, score in enumerate(scores):
        new_candidate = candidates[i].copy()
        new_candidate["rerank_score"] = float(score)
        reranked_candidates.append(new_candidate)
        
    # Sort descending by rerank_score
    reranked_candidates.sort(key=lambda x: x["rerank_score"], reverse=True)
    return reranked_candidates

async def execute_rerank(query: str, candidates: List[Dict], model_name: str) -> List[Dict]:
    """
    Execute reranking in a threadpool to avoid blocking the event loop.
    """
    if not candidates:
        return []
        
    return await asyncio.to_thread(_do_rerank, query, candidates, model_name)
