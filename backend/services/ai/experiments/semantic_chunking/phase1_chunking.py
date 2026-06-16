import time
import statistics
import tracemalloc
from typing import List, Dict
import tiktoken

from services.ai.experiments.semantic_chunking.chunkers.syntok_chunker import SyntokChunker
from services.ai.experiments.semantic_chunking.chunkers.nltk_chunker import NltkChunker

def calculate_overlap_preservation(chunks: List[str], min_overlap: int, encoder) -> float:
    if len(chunks) <= 1:
        return 100.0
    
    success_count = 0
    
    for i in range(len(chunks) - 1):
        c1 = chunks[i]
        c2 = chunks[i+1]
        
        c1_sentences = c1.split(". ")
        if len(c1_sentences) >= 1:
            last_sentence = c1_sentences[-1].strip()
            if last_sentence and last_sentence in c2:
                success_count += 1
            elif min_overlap == 0:
                success_count += 1
                
    return (success_count / (len(chunks) - 1)) * 100.0 if len(chunks) > 1 else 100.0


def run_phase1(documents: List[str]) -> List[Dict]:
    results = []
    encoder = tiktoken.get_encoding("cl100k_base")
    
    sizes = [256, 512, 768, 1024]
    
    for size in sizes:
        for name, ChunkerClass in [("Syntok", SyntokChunker), ("NLTK", NltkChunker)]:
            print(f"Running Phase 1: {name} @ {size}")
            chunker = ChunkerClass(target_chunk_size=size, min_overlap=2)
            
            tracemalloc.start()
            start_time = time.time()
            
            all_chunks = []
            for doc in documents:
                chunks = chunker.chunk(doc)
                all_chunks.extend(chunks)
                
            end_time = time.time()
            current, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            
            if not all_chunks:
                continue
                
            chunk_sizes = [len(encoder.encode(c)) for c in all_chunks]
            
            avg_size = sum(chunk_sizes) / len(chunk_sizes)
            min_size = min(chunk_sizes)
            max_size = max(chunk_sizes)
            std_dev = statistics.stdev(chunk_sizes) if len(chunk_sizes) > 1 else 0.0
            
            overlap_rate = calculate_overlap_preservation(all_chunks, 2, encoder)
            
            results.append({
                "tokenizer": name,
                "target_size": size,
                "avg_size": round(avg_size, 1),
                "min_size": min_size,
                "max_size": max_size,
                "std_dev": round(std_dev, 1),
                "overlap_rate": round(overlap_rate, 1),
                "time_sec": round(end_time - start_time, 3),
                "peak_ram_mb": round(peak / 10**6, 2),
                "total_chunks": len(all_chunks)
            })
            
    return results
