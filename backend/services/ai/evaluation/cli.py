import asyncio
import argparse
import logging
from prettytable import PrettyTable

from core.database import async_session_maker
from services.ai.evaluation.dataset import load_dataset, generate_synthetic_dataset, save_dataset
from services.ai.evaluation.runner import run_evaluation
from services.ai.evaluation.history import save_run, compare_runs

logging.basicConfig(level=logging.WARNING)

async def evaluate(workspace_id: str, datasets: list[str], gen_synthetic: int):
    all_data = []
    
    async with async_session_maker() as db:
        if gen_synthetic > 0:
            print(f"Generating synthetic dataset with {gen_synthetic} chunks...")
            syn_data = await generate_synthetic_dataset(workspace_id, db, gen_synthetic)
            if syn_data:
                save_dataset("synthetic", syn_data)
                all_data.extend(syn_data)
                print(f"Generated {len(syn_data)} synthetic queries.")
        
        for ds in datasets:
            data = load_dataset(ds)
            if data:
                all_data.extend(data)
                print(f"Loaded {len(data)} queries from {ds}.json")
                
        if not all_data:
            print("No dataset provided or generated.")
            return
            
        print(f"\nStarting evaluation with {len(all_data)} total queries...")
        aggregated_results, detailed_logs = await run_evaluation(workspace_id, db, all_data)
        
        run_id = save_run(workspace_id, aggregated_results, detailed_logs)
        
        print("\n======================================================================")
        print(f"ORLITH RAG BENCHMARK - {run_id.upper()}")
        print("======================================================================")
        
        table = PrettyTable()
        table.field_names = ["Mode", "Dataset", "Recall@5", "Recall@10", "MRR", "nDCG", "Latency"]
        
        for res in aggregated_results:
            table.add_row([
                res["retrieval_mode"],
                res["dataset_type"],
                res["recall_at_5"],
                res["recall_at_10"],
                res["mrr"],
                res["ndcg"],
                f"{res['average_latency_sec']}s"
            ])
            
        print(table)
        print(f"\nSaved run results to evaluation_runs/{run_id}.json")
        print(f"Saved detailed logs to evaluation_runs/{run_id}_details.json")

def compare(baseline: str, target: str):
    comps = compare_runs(baseline, target)
    
    print("\n======================================================================")
    print(f"ORLITH RAG BENCHMARK COMPARISON")
    print(f"{baseline} (Baseline) vs {target} (Target)")
    print("======================================================================")
    
    table = PrettyTable()
    table.field_names = ["Mode", "Dataset", "Recall@5 \u0394", "Recall@10 \u0394", "MRR \u0394"]
    
    for key, c in comps.items():
        table.add_row([
            c["retrieval_mode"],
            c["dataset_type"],
            f"{c['metrics']['recall_at_5']['delta']:+.4f}",
            f"{c['metrics']['recall_at_10']['delta']:+.4f}",
            f"{c['metrics']['mrr']['delta']:+.4f}"
        ])
    print(table)
    
    print("\n--- CATEGORY BREAKDOWN ---")
    cat_table = PrettyTable()
    cat_table.field_names = ["Mode", "Dataset", "Category", "Recall@5 \u0394"]
    
    for key, c in comps.items():
        for cat, vals in c["categories"].items():
            cat_table.add_row([
                c["retrieval_mode"],
                c["dataset_type"],
                cat,
                f"{vals['recall_at_5_delta']:+.4f}"
            ])
    print(cat_table)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Orlith Retrieval Evaluation Framework")
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    eval_parser = subparsers.add_parser("evaluate", help="Run benchmark")
    eval_parser.add_argument("workspace_id", help="Target workspace ID")
    eval_parser.add_argument("--datasets", nargs="+", default=["synthetic", "gold"], help="Datasets to load")
    eval_parser.add_argument("--generate-synthetic", type=int, default=0, help="Generate N chunks of synthetic data")
    
    comp_parser = subparsers.add_parser("compare", help="Compare two runs")
    comp_parser.add_argument("baseline", help="Baseline run ID (e.g. run_001)")
    comp_parser.add_argument("target", help="Target run ID (e.g. run_002)")
    
    args = parser.parse_args()
    
    if args.command == "evaluate":
        asyncio.run(evaluate(args.workspace_id, args.datasets, args.generate_synthetic))
    elif args.command == "compare":
        compare(args.baseline, args.target)
