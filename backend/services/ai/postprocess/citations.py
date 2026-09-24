import math
from typing import List, Dict, Tuple


def calculate_calibrated_relevance(chunk_data: Dict) -> float:
    """
    Calculate normalized relevance score (0.0 to 1.0) across all retrieval modes:
    - Reranker cross-encoder logits
    - RRF (Reciprocal Rank Fusion) scores
    - ChromaDB cosine distance
    """
    if "relevance_score" in chunk_data:
        return float(chunk_data["relevance_score"])

    if "rerank_score" in chunk_data:
        raw_score = chunk_data["rerank_score"]
        try:
            return round(1.0 / (1.0 + math.exp(-raw_score)), 4)
        except OverflowError:
            return 1.0 if raw_score > 0 else 0.0

    if "reranker_score" in chunk_data:
        raw_score = chunk_data["reranker_score"]
        try:
            return round(1.0 / (1.0 + math.exp(-raw_score)), 4)
        except OverflowError:
            return 1.0 if raw_score > 0 else 0.0

    if "rrf_score" in chunk_data:
        # RRF scores typically range from ~0.015 to ~0.035. Scale appropriately to 0.50 - 0.95
        rrf = chunk_data["rrf_score"]
        scaled = max(0.40, min(0.98, rrf * 32))
        return round(scaled, 4)

    if "distance" in chunk_data and chunk_data["distance"] is not None:
        dist = chunk_data["distance"]
        return round(max(0.0, min(1.0, 1.0 - dist)), 4)

    return 0.75


def generate_citations(chunks: List[Dict]) -> Tuple[List[str], List[Dict]]:
    """
    Given a list of retrieval chunks, format their text representations for the LLM
    (utilizing parent_content when available for maximum semantic context)
    and construct the detailed citations object expected by the frontend.
    """
    valid_chunks_text: List[str] = []
    citations: List[Dict] = []

    for idx, chunk_data in enumerate(chunks):
        citation_num = idx + 1
        doc_text = chunk_data.get("text", "")
        meta = chunk_data.get("meta") or {}

        # 1. Calibrated relevance score
        similarity = calculate_calibrated_relevance(chunk_data)

        # 2. Context for LLM: prefer parent_content if present
        parent_content = (
            chunk_data.get("parent_content")
            or meta.get("parent_content")
            or doc_text
        )
        llm_text = parent_content.strip() if parent_content else doc_text.strip()

        # Format chunk header
        filename = meta.get("filename", "Unknown")
        page = meta.get("page_number", "?")
        section = meta.get("section")
        
        header = f"[{citation_num}] Dokumen: {filename}, Halaman: {page}"
        if section:
            header += f", Bagian: {section}"

        valid_chunks_text.append(f"{header}\nIsi:\n{llm_text}")

        # Citation object for frontend
        citations.append({
            "citationNumber": citation_num,
            "docId": meta.get("document_id", "unknown"),
            "docName": filename,
            "page": page,
            "section": section,
            "snippet": doc_text[:250] + "..." if len(doc_text) > 250 else doc_text,
            "fullText": llm_text[:800] + "..." if len(llm_text) > 800 else llm_text,
            "relevanceScore": similarity,
        })

    return valid_chunks_text, citations

