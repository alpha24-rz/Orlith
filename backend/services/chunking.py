import re

class StructuralTextSplitter:
    def __init__(self, chunk_size: int = 1024, chunk_overlap: int = 128):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def _is_heading(self, text: str) -> bool:
        """Heuristic to detect if a text block is a heading."""
        text = text.strip()
        if not text:
            return False
            
        # Markdown headings
        if re.match(r'^#{1,6}\s+', text):
            return True
            
        # All caps and relatively short
        if text.isupper() and len(text) < 100:
            return True
            
        # BAB or Section prefixes
        if re.match(r'^(BAB|CHAPTER|SECTION|BAGIAN)\s+[IVXLCDM\d]+', text, re.IGNORECASE):
            return True
            
        return False

    def split_pages(self, pages: list[dict]) -> list[dict]:
        """
        Takes pages data: [{"text": "...", "page_number": 1}]
        Returns chunks: [{"text": "...", "page_number": 1, "section": "...", "chunk_index": 0}]
        """
        chunks = []
        current_section = None
        chunk_idx = 0
        
        for page in pages:
            page_text = page.get("text", "")
            page_num = page.get("page_number", 1)
            
            # Split by double newline (paragraphs)
            blocks = [b.strip() for b in re.split(r'\n\n+', page_text) if b.strip()]
            
            current_chunk_text = ""
            current_chunk_token_count = 0
            
            for block in blocks:
                # Update section if this block is a heading
                if self._is_heading(block):
                    # We might want to save the current chunk before starting a new section
                    if current_chunk_text:
                        chunks.append({
                            "text": current_chunk_text.strip(),
                            "page_number": page_num,
                            "section": current_section,
                            "chunk_index": chunk_idx,
                            "token_count": current_chunk_token_count
                        })
                        chunk_idx += 1
                        current_chunk_text = ""
                        current_chunk_token_count = 0
                        
                    current_section = block[:200] # Limit section name length
                    # Headings themselves should also be part of the chunk content usually
                    current_chunk_text += block + "\n\n"
                    # Rough token estimation: 1 word ~ 1.3 tokens
                    current_chunk_token_count += int(len(block.split()) * 1.3)
                    continue
                
                block_tokens = int(len(block.split()) * 1.3)
                
                # If adding this block exceeds chunk size, save current chunk and start new
                if current_chunk_text and current_chunk_token_count + block_tokens > self.chunk_size:
                    chunks.append({
                        "text": current_chunk_text.strip(),
                        "page_number": page_num,
                        "section": current_section,
                        "chunk_index": chunk_idx,
                        "token_count": current_chunk_token_count
                    })
                    chunk_idx += 1
                    
                    # Overlap handling (simplistic: carry over the last block if it's small enough)
                    if block_tokens < self.chunk_overlap:
                        current_chunk_text = block + "\n\n"
                        current_chunk_token_count = block_tokens
                    else:
                        current_chunk_text = block + "\n\n"
                        current_chunk_token_count = block_tokens
                else:
                    current_chunk_text += block + "\n\n"
                    current_chunk_token_count += block_tokens

            # End of page - flush remaining chunk if large enough or if it's the last page
            # Actually, we can let chunks span pages, but for citation accuracy, it's better
            # to split at page boundaries so the page_number citation is exact.
            if current_chunk_text.strip():
                chunks.append({
                    "text": current_chunk_text.strip(),
                    "page_number": page_num,
                    "section": current_section,
                    "chunk_index": chunk_idx,
                    "token_count": current_chunk_token_count
                })
                chunk_idx += 1

        return chunks
