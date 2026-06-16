import asyncio
import json
import os
import glob
from prettytable import PrettyTable, TableStyle

from services.ai.experiments.semantic_chunking.phase1_chunking import run_phase1
from services.ai.experiments.semantic_chunking.phase2_retrieval import run_phase2
from services.ingestion import extract_text_from_file

def load_real_documents():
    print("Extracting text from PDFs in backend/uploads/ ...")
    docs = []
    # Relative path from cli.py up to backend/uploads
    upload_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../uploads/"))
    pdf_files = glob.glob(os.path.join(upload_dir, "*.pdf"))
    
    for pdf_path in pdf_files:
        print(f"Reading: {os.path.basename(pdf_path)}")
        try:
            pages_data, _ = extract_text_from_file(pdf_path, "application/pdf")
            full_text = "\n".join([p["text"] for p in pages_data if p.get("text")])
            if full_text.strip():
                docs.append(full_text)
        except Exception as e:
            print(f"Failed to read {os.path.basename(pdf_path)}: {e}")
            
    return docs

def main():
    print("Starting Semantic Chunking Benchmark (Isolated Module)")
    
    TEST_DOCUMENTS = load_real_documents()
    if not TEST_DOCUMENTS:
        print("No valid documents found. Exiting.")
        return
        
    print(f"Loaded {len(TEST_DOCUMENTS)} real documents for Phase 1 testing.")

    
    # PHASE 1
    print("\n--- PHASE 1: Structural Chunking ---")
    phase1_results = run_phase1(TEST_DOCUMENTS)
    
    p1_table = PrettyTable()
    p1_table.field_names = ["Tokenizer", "Target Size", "Avg Size", "Min", "Max", "StdDev", "Overlap %", "Time (s)", "Peak RAM (MB)"]
    
    for r in phase1_results:
        p1_table.add_row([
            r["tokenizer"], r["target_size"], r["avg_size"], r["min_size"], 
            r["max_size"], r["std_dev"], f"{r['overlap_rate']}%", r["time_sec"], r["peak_ram_mb"]
        ])
        
    print(p1_table)
    
    # Sort Phase 1 to find Top 3
    # We want tight stddev and fast time
    sorted_configs = sorted(phase1_results, key=lambda x: (x["std_dev"], x["time_sec"]))
    top_3 = sorted_configs[:3]
    
    # PHASE 2
    print("\n--- PHASE 2: Retrieval Evaluation (Top 3) ---")
    phase2_results = asyncio.run(run_phase2(top_3, TEST_DOCUMENTS))
    
    p2_table = PrettyTable()
    p2_table.field_names = ["Tokenizer", "Target Size", "Recall@5", "Recall@10", "MRR", "nDCG"]
    
    for r in phase2_results:
        p2_table.add_row([
            r["tokenizer"], r["target_size"], r["recall_at_5"], r["recall_at_10"], r["mrr"], r["ndcg"]
        ])
        
    print(p2_table)
    
    # Output to files
    out_dir = os.path.dirname(os.path.abspath(__file__))
    
    json_data = {
        "phase1": phase1_results,
        "phase2": phase2_results
    }
    
    with open(os.path.join(out_dir, "benchmark_results.json"), "w") as f:
        json.dump(json_data, f, indent=2)
        
    with open(os.path.join(out_dir, "benchmark_results.md"), "w") as f:
        f.write("# Semantic Chunking Benchmark Results\n\n")
        f.write("## Phase 1: Structural Metrics\n\n")
        
        from prettytable import MARKDOWN
        p1_table.set_style(MARKDOWN)
        f.write(p1_table.get_string())
        
        f.write("\n\n## Phase 2: Retrieval Quality (Top 3)\n\n")
        p2_table.set_style(MARKDOWN)
        f.write(p2_table.get_string())
        f.write("\n")
        
    print(f"\nBenchmark complete. Saved results to {out_dir}/benchmark_results.md")

if __name__ == "__main__":
    main()
