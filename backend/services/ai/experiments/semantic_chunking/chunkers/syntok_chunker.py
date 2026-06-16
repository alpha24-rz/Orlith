import tiktoken
from typing import List
import syntok.segmenter as segmenter
from services.ai.experiments.semantic_chunking.chunkers.base import BaseSemanticChunker

class SyntokChunker(BaseSemanticChunker):
    def __init__(self, target_chunk_size: int = 512, min_overlap: int = 2):
        super().__init__(target_chunk_size, min_overlap)
        self.encoder = tiktoken.get_encoding("cl100k_base")

    def chunk(self, text: str) -> List[str]:
        sentences = []
        for paragraph in segmenter.process(text):
            for sentence in paragraph:
                s_str = "".join([t.spacing + t.value for t in sentence]).strip()
                if s_str:
                    sentences.append(s_str)
                    
        return self._pack_sentences(sentences)
        
    def _pack_sentences(self, sentences: List[str]) -> List[str]:
        chunks = []
        current_chunk = []
        current_size = 0
        
        for s in sentences:
            s_size = len(self.encoder.encode(s))
            
            if current_size + s_size > self.target_chunk_size and current_chunk:
                chunks.append(" ".join(current_chunk))
                overlap = current_chunk[-self.min_overlap:] if len(current_chunk) > self.min_overlap else current_chunk
                current_chunk = overlap.copy()
                current_chunk.append(s)
                current_size = sum(len(self.encoder.encode(x)) for x in current_chunk)
            else:
                current_chunk.append(s)
                current_size += s_size
                
        if current_chunk:
            chunks.append(" ".join(current_chunk))
            
        return chunks
