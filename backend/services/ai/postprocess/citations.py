from typing import List, Dict, Tuple

def generate_citations(chunks: List[Dict]) -> Tuple[List[str], List[Dict]]:
    """
    Given a list of Chroma retrieval chunks, format their text representations
    and construct the detailed citations object expected by the frontend.
    """
    valid_chunks_text: List[str] = []
    citations: List[Dict] = []

    for idx, chunk_data in enumerate(chunks):
        citation_num = idx + 1
        doc_text = chunk_data["text"]
        meta = chunk_data.get("meta") or {}
        distance = chunk_data.get("distance", 1.0)

        similarity = round(max(0.0, min(1.0, 1.0 - distance)), 4)

        # Format chunk with citation number
        valid_chunks_text.append(
            f"[{citation_num}] Dokumen: {meta.get('filename', 'Unknown')}, "
            f"Halaman: {meta.get('page_number', '?')}\n"
            f"Isi: {doc_text}"
        )

        # Citation object for frontend
        citations.append({
            "citationNumber": citation_num,
            "docId": meta.get("document_id", "unknown"),
            "docName": meta.get("filename", "Unknown"),
            "page": meta.get("page_number", "?"),
            "snippet": doc_text[:200] + "..." if len(doc_text) > 200 else doc_text,
            "fullText": doc_text[:500] + "..." if len(doc_text) > 500 else doc_text,
            "relevanceScore": similarity,
        })

    return valid_chunks_text, citations
