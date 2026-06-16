from abc import ABC, abstractmethod
from typing import List

class BaseSemanticChunker(ABC):
    def __init__(self, target_chunk_size: int = 512, min_overlap: int = 2):
        self.target_chunk_size = target_chunk_size
        self.min_overlap = min_overlap # Minimum overlapping sentences

    @abstractmethod
    def chunk(self, text: str) -> List[str]:
        pass
