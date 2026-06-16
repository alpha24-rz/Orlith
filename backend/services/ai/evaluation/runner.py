import time
import logging
from typing import List, Dict, Tuple
from collections import defaultdict
from tqdm import tqdm

from sqlalchemy.ext.asyncio import AsyncSession
from models import Workspace
from services.ai.retrieval.config import RetrievalConfig
from services.ai.retrieval.search import retrieve_relevant_chunks
from services.ai.retrieval.utils import build_chunk_uid
from services.ai.evaluation.metrics import calculate_mrr, calculate_recall_at_k, calculate_ndcg

logger = logging.getLogger(__name__)

async def run_evaluation(workspace_id: str, db: AsyncSession, datasets: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
    """Runs the benchmark and returns (aggregated_results, detailed_logs)"""
    workspace = await db.get(Workspace, workspace_id)
    if not workspace:
        raise ValueError(f"Workspace {workspace_id} not found.")

    modes = [
        ("Dense Only", RetrievalConfig(enable_hybrid_search=False, enable_reranker=False)),
        ("Dense + Cross Encoder", RetrievalConfig(enable_hybrid_search=False, enable_reranker=True)),
        ("Hybrid", RetrievalConfig(enable_hybrid_search=True, enable_reranker=False)),
        ("Hybrid + Cross Encoder", RetrievalConfig(enable_hybrid_search=True, enable_reranker=True)),
    ]

    detailed_logs = []
    
    # Aggregators: dict[mode][dataset_type][category] -> metrics list
    raw_results = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))

    for mode_name, config in modes:
        print(f"\nRunning Mode: {mode_name}")
        for data in tqdm(datasets, desc=f"{mode_name}"):
            query = data["query"]
            expected_uid = data["expected_chunk_uid"]
            dataset_type = data.get("type", "synthetic")
            category = data.get("category", "direct")

            t1 = time.time()
            chunks = await retrieve_relevant_chunks(
                workspace_id=workspace_id,
                query=query,
                db=db,
                top_k=10,
                enable_rewriting=False, # Disable rewriting for strict eval
                retrieval_config=config
            )
            t2 = time.time()
            latency = t2 - t1

            # Find rank
            rank = -1
            for i, c in enumerate(chunks, 1):
                meta = c.get("meta", {})
                uid = build_chunk_uid(meta.get("document_id"), meta.get("chunk_index"))
                if uid == expected_uid:
                    rank = i
                    break

            # Calculate metrics
            mrr = calculate_mrr(rank)
            rec5 = calculate_recall_at_k(rank, 5)
            rec10 = calculate_recall_at_k(rank, 10)
            ndcg = calculate_ndcg(rank, 10)

            # Log details
            detailed_logs.append({
                "query": query,
                "category": category,
                "expected_chunk_uid": expected_uid,
                "retrieved_rank": rank,
                "success_at_5": rec5 > 0,
                "success_at_10": rec10 > 0,
                "mrr_score": mrr,
                "retrieval_mode": mode_name,
                "dataset_type": dataset_type,
                "latency_sec": round(latency, 4)
            })

            # Add to aggregators
            metrics = {
                "mrr": mrr,
                "recall_at_5": rec5,
                "recall_at_10": rec10,
                "ndcg": ndcg,
                "latency_sec": latency
            }
            raw_results[mode_name][dataset_type][category].append(metrics)
            raw_results[mode_name][dataset_type]["_overall_"].append(metrics)

    # Calculate Aggregates
    aggregated_results = []
    
    def avg(lst, key):
        if not lst: return 0.0
        return round(sum(i[key] for i in lst) / len(lst), 4)

    for mode_name, ds_map in raw_results.items():
        for dataset_type, cat_map in ds_map.items():
            overall_lst = cat_map["_overall_"]
            
            res = {
                "retrieval_mode": mode_name,
                "dataset_type": dataset_type,
                "recall_at_5": avg(overall_lst, "recall_at_5"),
                "recall_at_10": avg(overall_lst, "recall_at_10"),
                "mrr": avg(overall_lst, "mrr"),
                "ndcg": avg(overall_lst, "ndcg"),
                "average_latency_sec": avg(overall_lst, "latency_sec"),
                "category_metrics": {}
            }
            
            for cat, cat_lst in cat_map.items():
                if cat == "_overall_": continue
                res["category_metrics"][cat] = {
                    "recall_at_5": avg(cat_lst, "recall_at_5"),
                    "recall_at_10": avg(cat_lst, "recall_at_10"),
                    "mrr": avg(cat_lst, "mrr"),
                    "ndcg": avg(cat_lst, "ndcg")
                }
                
            aggregated_results.append(res)
            
    return aggregated_results, detailed_logs
