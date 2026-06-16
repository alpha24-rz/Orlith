import json
import os
from datetime import datetime, timezone
from typing import List, Dict, Any

HISTORY_DIR = os.path.join(os.path.dirname(__file__), "../../../evaluation_runs")

def get_next_run_id() -> str:
    if not os.path.exists(HISTORY_DIR):
        os.makedirs(HISTORY_DIR)
    
    files = [f for f in os.listdir(HISTORY_DIR) if f.startswith("run_") and not f.endswith("_details.json")]
    
    if not files:
        return "run_001"
        
    ids = []
    for f in files:
        try:
            num = int(f.replace("run_", "").replace(".json", ""))
            ids.append(num)
        except ValueError:
            pass
            
    if not ids:
        return "run_001"
        
    next_id = max(ids) + 1
    return f"run_{next_id:03d}"

def save_run(workspace_id: str, results: List[Dict], details: List[Dict]):
    if not os.path.exists(HISTORY_DIR):
        os.makedirs(HISTORY_DIR)
        
    run_id = get_next_run_id()
    
    run_data = {
        "run_id": run_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "workspace_id": workspace_id,
        "results": results
    }
    
    run_file = os.path.join(HISTORY_DIR, f"{run_id}.json")
    with open(run_file, "w") as f:
        json.dump(run_data, f, indent=2)
        
    details_file = os.path.join(HISTORY_DIR, f"{run_id}_details.json")
    with open(details_file, "w") as f:
        json.dump(details, f, indent=2)
        
    return run_id

def load_run(run_id: str) -> Dict:
    run_file = os.path.join(HISTORY_DIR, f"{run_id}.json")
    if not os.path.exists(run_file):
        raise FileNotFoundError(f"Run {run_id} not found.")
        
    with open(run_file, "r") as f:
        return json.load(f)

def compare_runs(baseline_id: str, target_id: str) -> Dict[str, Any]:
    baseline = load_run(baseline_id)
    target = load_run(target_id)
    
    comparisons = {}
    
    # Map by (mode, dataset)
    base_map = {(r["retrieval_mode"], r["dataset_type"]): r for r in baseline.get("results", [])}
    target_map = {(r["retrieval_mode"], r["dataset_type"]): r for r in target.get("results", [])}
    
    for key in set(base_map.keys()).union(target_map.keys()):
        b = base_map.get(key, {})
        t = target_map.get(key, {})
        
        mode, dataset = key
        
        comp = {
            "retrieval_mode": mode,
            "dataset_type": dataset,
            "metrics": {}
        }
        
        for metric in ["recall_at_5", "recall_at_10", "mrr", "ndcg", "average_latency_sec"]:
            b_val = b.get(metric, 0.0)
            t_val = t.get(metric, 0.0)
            comp["metrics"][metric] = {
                "baseline": b_val,
                "target": t_val,
                "delta": round(t_val - b_val, 4)
            }
            
        # Category breakdown comparison
        b_cats = b.get("category_metrics", {})
        t_cats = t.get("category_metrics", {})
        
        comp["categories"] = {}
        for cat in set(b_cats.keys()).union(t_cats.keys()):
            b_cat_val = b_cats.get(cat, {}).get("recall_at_5", 0.0)
            t_cat_val = t_cats.get(cat, {}).get("recall_at_5", 0.0)
            comp["categories"][cat] = {
                "recall_at_5_delta": round(t_cat_val - b_cat_val, 4)
            }
            
        str_key = f"{mode} | {dataset}"
        comparisons[str_key] = comp
        
    return comparisons
