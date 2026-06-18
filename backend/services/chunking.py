import re
import logging

logger = logging.getLogger(__name__)


def clean_pdf_text(text: str) -> str:
    """
    Remove common PDF extraction artifacts before chunking.
    This dramatically improves embedding quality for scanned/academic PDFs.
    """
    if not text:
        return text

    # 1. Remove (cid:XXX) artifacts — the #1 quality killer
    #    These are CID-keyed font references that pdfplumber can't decode.
    text = re.sub(r'\(cid:\d+\)', '', text)

    # 2. Normalize common ligatures and special chars from PDF fonts
    ligature_map = {
        'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬀ': 'ff', 'ﬃ': 'ffi', 'ﬄ': 'ffl',
        '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"',
        '\u2013': '-', '\u2014': '--', '\u00a0': ' ',
    }
    for lig, replacement in ligature_map.items():
        text = text.replace(lig, replacement)

    # 3. Remove orphaned control characters
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)

    # 4. Fix concatenated words from poor PDF extraction
    #    Pattern: lowercaseUPPERCASE boundary (e.g. "methodologyResults" → "methodology Results")
    text = re.sub(r'([a-z])([A-Z][a-z])', r'\1 \2', text)
    #    Pattern: letterDigit boundary in non-standard places (e.g. "Section3" → "Section 3")
    #    But be careful not to break things like "GPT4o" or "H2O"
    text = re.sub(r'([a-zA-Z]{3,})(\d)', r'\1 \2', text)

    # 5. Normalize whitespace: collapse runs of spaces (but preserve newlines)
    text = re.sub(r'[^\S\n]+', ' ', text)

    # 6. Collapse excessive blank lines (3+ → 2)
    text = re.sub(r'\n{3,}', '\n\n', text)

    # 7. Remove lines that are purely page numbers or header/footer artifacts
    lines = text.split('\n')
    cleaned_lines = []
    for line in lines:
        stripped = line.strip()
        # Skip lines that are just a number (page numbers)
        if re.match(r'^\d{1,4}$', stripped):
            continue
        cleaned_lines.append(line)

    text = '\n'.join(cleaned_lines)

    return text.strip()


class StructuralTextSplitter:
    def __init__(self, chunk_size: int = 1024, chunk_overlap: int = 128, is_markdown: bool = False):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.is_markdown = is_markdown

        # Academic paper section headings (case-insensitive matching)
        self._academic_headings = [
            "abstract", "introduction", "background", "related work",
            "literature review", "methodology", "methods", "method",
            "materials and methods", "experimental setup", "experiment",
            "experiments", "experimental results", "results",
            "results and discussion", "discussion", "analysis",
            "evaluation", "implementation", "system design",
            "proposed method", "proposed approach", "proposed system",
            "data collection", "dataset", "data", "preprocessing",
            "model architecture", "architecture", "framework",
            "theoretical framework", "conclusion", "conclusions",
            "future work", "limitations", "acknowledgements",
            "acknowledgments", "references", "bibliography",
            "appendix", "appendices", "supplementary material",
            # Indonesian academic headings
            "pendahuluan", "tinjauan pustaka", "metode penelitian",
            "hasil dan pembahasan", "hasil", "pembahasan",
            "kesimpulan", "saran", "daftar pustaka", "lampiran",
        ]
        # Build a compiled regex for numbered headings: "1. Introduction", "2.1 Methods", "III. Results"
        self._numbered_heading_re = re.compile(
            r'^(?:'
            r'(?:\d+\.?\d*\.?\s+)'           # "1. ", "2.1 ", "3.2.1 "
            r'|(?:[IVXLCDM]+\.?\s+)'          # "I. ", "III ", "IV. "
            r')(.+)',
            re.IGNORECASE
        )
        self._stopwords = {
            'is', 'are', 'the', 'a', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'with', 'by', 'at', 'from',
            'be', 'has', 'have', 'was', 'were', 'that', 'this', 'an', 'as', 'but', 'by', 'if', 'than', 'then',
            'thus', 'so', 'yet', 'with', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'any',
            'because', 'been', 'before', 'being', 'below', 'between', 'both', 'during', 'each', 'few', 'further'
        }

    def _is_heading(self, text: str) -> bool:
        """Detect if a text block is a section heading."""
        text = text.strip()
        if not text:
            return False

        # Too long to be a heading
        if len(text) > 120:
            return False

        # Must contain at least one letter
        if not any(c.isalpha() for c in text):
            return False

        # Markdown headings (only if it is markdown)
        if self.is_markdown and re.match(r'^#{1,6}\s+', text):
            return True

        # BAB / CHAPTER / SECTION prefixes
        if re.match(r'^(BAB|CHAPTER|SECTION|BAGIAN|PART)\s+[IVXLCDM\d]+', text, re.IGNORECASE):
            return True

        # Exact match against known academic headings (case-insensitive)
        text_lower = text.lower().strip()
        # Remove trailing period or colon
        text_clean = re.sub(r'[.:]$', '', text_lower).strip()
        if text_clean in self._academic_headings:
            return True

        # Reject floats / table entries starting with 0. (e.g. "0.55 Direct FT")
        if re.match(r'^0\.\d+', text):
            return False

        # Helper to check if a word is a stopword or trailing punctuation
        words = text_clean.split()
        if words and (words[-1] in self._stopwords or text.endswith((',', ';'))):
            return False

        # Check letter/space ratio to filter out math symbols / chart labels
        letter_space_count = sum(1 for c in text if c.isalpha() or c.isspace())
        if letter_space_count / len(text) < 0.70:
            return False

        # Numbered heading: "1. Introduction", "2.1 Related Work", "III. Methods"
        m = self._numbered_heading_re.match(text)
        if m:
            heading_body = m.group(1).strip()
            if not heading_body:
                return False
            # Body must start with an uppercase letter
            if not heading_body[0].isupper():
                return False
            
            heading_clean = re.sub(r'[.:]$', '', heading_body.lower()).strip()
            if heading_clean in self._academic_headings:
                return True
                
            # Fallback for short numbered headings
            if len(heading_body) < 60 and '.' not in heading_body:
                return True

        # ALL CAPS and relatively short (but at least 7 chars to avoid noise)
        if text.isupper() and len(text) >= 7 and text[0].isalpha():
            # Filter out common abbreviations
            if text in ('IEEE', 'ACM', 'HTML', 'JSON', 'YAML', 'HTTP', 'HTTPS', 'RAG', 'LLM', 'LLMS', 'PDF', 'Word'):
                return False
            return True

        return False

    def split_pages(self, pages: list[dict]) -> list[dict]:
        """
        Takes pages data: [{"text": "...", "page_number": 1}]
        Returns chunks: [{"text": "...", "page_number": 1, "section": "...", "chunk_index": 0}]

        IMPORTANT: Chunks span across page boundaries to maximize semantic coherence.
        The page_number stored is the page where the chunk *starts*.
        """
        chunks = []
        current_section = None
        chunk_idx = 0
        current_chunk_text = ""
        current_chunk_token_count = 0
        current_chunk_start_page = 1

        for page in pages:
            page_text = page.get("text", "")
            page_num = page.get("page_number", 1)

            # Apply text cleaning BEFORE chunking
            page_text = clean_pdf_text(page_text)

            # Split into fine-grained blocks: first by double newline, then check each
            # for embedded headings separated by single newlines
            raw_blocks = [b.strip() for b in re.split(r'\n\n+', page_text) if b.strip()]
            
            blocks = []
            for raw_block in raw_blocks:
                # Check if this block contains embedded headings on individual lines
                lines = raw_block.split('\n')
                if len(lines) > 1:
                    # Scan lines for headings and split at heading boundaries
                    sub_block = ""
                    for line in lines:
                        line_stripped = line.strip()
                        if self._is_heading(line_stripped) and sub_block.strip():
                            blocks.append(sub_block.strip())
                            blocks.append(line_stripped)
                            sub_block = ""
                        elif self._is_heading(line_stripped):
                            blocks.append(line_stripped)
                            sub_block = ""
                        else:
                            sub_block += line + "\n"
                    if sub_block.strip():
                        blocks.append(sub_block.strip())
                else:
                    blocks.append(raw_block)

            for block in blocks:
                # Update section if this block is a heading
                if self._is_heading(block):
                    # Save the current chunk before starting a new section
                    if current_chunk_text.strip():
                        chunks.append({
                            "text": current_chunk_text.strip(),
                            "page_number": current_chunk_start_page,
                            "section": current_section,
                            "chunk_index": chunk_idx,
                            "token_count": current_chunk_token_count
                        })
                        chunk_idx += 1
                        current_chunk_text = ""
                        current_chunk_token_count = 0

                    current_section = block[:200]
                    current_chunk_start_page = page_num
                    current_chunk_text += block + "\n\n"
                    current_chunk_token_count += int(len(block.split()) * 1.3)
                    continue

                block_tokens = int(len(block.split()) * 1.3)

                # If adding this block exceeds chunk size, save current chunk
                if current_chunk_text and current_chunk_token_count + block_tokens > self.chunk_size:
                    chunks.append({
                        "text": current_chunk_text.strip(),
                        "page_number": current_chunk_start_page,
                        "section": current_section,
                        "chunk_index": chunk_idx,
                        "token_count": current_chunk_token_count
                    })
                    chunk_idx += 1

                    # Overlap: carry over last portion of text
                    overlap_text = self._get_overlap_text(current_chunk_text)
                    overlap_tokens = int(len(overlap_text.split()) * 1.3)
                    current_chunk_text = overlap_text + block + "\n\n"
                    current_chunk_token_count = overlap_tokens + block_tokens
                    current_chunk_start_page = page_num
                else:
                    if not current_chunk_text:
                        current_chunk_start_page = page_num
                    current_chunk_text += block + "\n\n"
                    current_chunk_token_count += block_tokens

        # Flush the last chunk
        if current_chunk_text.strip():
            chunks.append({
                "text": current_chunk_text.strip(),
                "page_number": current_chunk_start_page,
                "section": current_section,
                "chunk_index": chunk_idx,
                "token_count": current_chunk_token_count
            })

        logger.info(
            f"Chunking complete: {len(chunks)} chunks, "
            f"avg tokens={sum(c['token_count'] for c in chunks) / max(len(chunks), 1):.0f}, "
            f"sections detected={sum(1 for c in chunks if c['section'])}"
        )
        return chunks

    def _get_overlap_text(self, text: str) -> str:
        """Extract the tail end of text for overlap into the next chunk."""
        words = text.split()
        overlap_word_count = int(self.chunk_overlap / 1.3)  # reverse the token estimation
        if len(words) <= overlap_word_count:
            return text
        return ' '.join(words[-overlap_word_count:]) + "\n\n"
