import time
from typing import List, Dict

class PipelineContext:
    """Membawa state dan metrik performa pipeline dari awal hingga akhir."""
    def __init__(self, document_id: str, enqueue_time: float):
        self.document_id = document_id
        self.start_time = time.time()
        self.enqueue_time = enqueue_time
        
        self.metrics = {
            "queue_time": round(self.start_time - self.enqueue_time, 4),
            "extraction_time": 0.0,
            "chunking_time": 0.0,
            "embedding_time": 0.0, # API Time
            "storage_time": 0.0,   # I/O Time
            "total_time": 0.0,
            "chunk_count": 0,
            "page_count": 0
        }
        
        self.status_history: List[Dict[str, str]] = []
        self._record_status("queued")
        
    def _record_status(self, status: str):
        self.status_history.append({
            "status": status,
            "timestamp": time.time()
        })
        
    def transition(self, new_status: str):
        """Misal: extracting -> chunking -> embedding -> storing -> ready"""
        self._record_status(new_status)
        
    def record(self, metric: str, duration: float):
        self.metrics[metric] = round(duration, 4)
        
    def finalize(self):
        self.metrics["total_time"] = round(time.time() - self.start_time, 4)
        return self.metrics, self.status_history
