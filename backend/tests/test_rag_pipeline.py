import sys
import os
import math

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.query_rewriter import extract_search_keywords, is_indonesian_query
from services.ai.retrieval.fusion import multi_list_rrf, reciprocal_rank_fusion
from services.ai.retrieval.search import coalesce_adjacent_chunks, normalize_filename
from services.ai.postprocess.citations import calculate_calibrated_relevance, generate_citations


def test_indonesian_query_detection():
    assert is_indonesian_query("berapa hari cuti tahunan menurut peraturan?") is True
    assert is_indonesian_query("syarat dan ketentuan pengunduran diri karyawan") is True
    assert is_indonesian_query("what are the annual leave entitlement policies?") is False
    assert is_indonesian_query("system architecture and data flow diagram") is False


def test_search_keyword_extraction():
    q = 'Berapa pesangon menurut "UU No. 13 Tahun 2003" Pasal 156 untuk PT Maju Mundur?'
    keywords = extract_search_keywords(q)
    # Check that quoted term or legal code or acronym was extracted
    assert any("UU" in k or "Pasal" in k or "13" in k for k in keywords)
    assert any("PT" in k for k in keywords)


def test_coalesce_adjacent_chunks():
    chunks = [
        {
            "text": "Paragraf pertama pasal 1.",
            "meta": {"document_id": "doc1", "chunk_index": 0, "page_number": 1},
            "relevance_score": 0.85,
        },
        {
            "text": "Paragraf kedua pasal 1 kelanjutan.",
            "meta": {"document_id": "doc1", "chunk_index": 1, "page_number": 1},
            "relevance_score": 0.80,
        },
        {
            "text": "Bagian terpisah tentang pasal 5.",
            "meta": {"document_id": "doc1", "chunk_index": 5, "page_number": 3},
            "relevance_score": 0.70,
        },
    ]

    stitched = coalesce_adjacent_chunks(chunks)
    assert len(stitched) == 2  # chunks 0 and 1 are stitched into 1 chunk
    assert "Paragraf pertama" in stitched[0]["text"]
    assert "Paragraf kedua" in stitched[0]["text"]
    assert stitched[0]["relevance_score"] == 0.85
    assert stitched[1]["meta"]["chunk_index"] == 5


def test_multi_list_rrf_scoring():
    list1 = [
        {"text": "A", "meta": {"document_id": "d1", "chunk_index": 1}},
        {"text": "B", "meta": {"document_id": "d1", "chunk_index": 2}},
    ]
    list2 = [
        {"text": "B", "meta": {"document_id": "d1", "chunk_index": 2}},
        {"text": "C", "meta": {"document_id": "d2", "chunk_index": 1}},
    ]

    fused = multi_list_rrf([(list1, 1.0), (list2, 1.0)], rrf_k=60)
    # Item B appears in both lists, so its RRF score must be highest
    assert fused[0]["meta"]["chunk_index"] == 2
    assert fused[0]["rrf_appearances"] == 2
    assert len(fused) == 3


def test_calculate_calibrated_relevance():
    # Reranker logit 2.5 -> sigmoid ~0.924
    chunk_rerank = {"rerank_score": 2.5}
    score1 = calculate_calibrated_relevance(chunk_rerank)
    assert 0.90 <= score1 <= 0.95

    # RRF score 0.025 -> scaled ~0.80
    chunk_rrf = {"rrf_score": 0.025}
    score2 = calculate_calibrated_relevance(chunk_rrf)
    assert 0.70 <= score2 <= 0.90

    # Distance 0.2 -> similarity 0.8
    chunk_dist = {"distance": 0.2}
    score3 = calculate_calibrated_relevance(chunk_dist)
    assert abs(score3 - 0.8) < 1e-4

    # Must never be 0.0 for valid input
    assert score1 > 0.0
    assert score2 > 0.0
    assert score3 > 0.0


def test_generate_citations_parent_context():
    chunks = [
        {
            "text": "Anak kalimat 1 yang sangat pendek.",
            "meta": {
                "document_id": "doc123",
                "filename": "SOP_Perusahaan.pdf",
                "page_number": 2,
                "section": "Ketentuan Cuti",
                "parent_content": "Ini adalah seluruh paragraf lengkap dari dokumen SOP Perusahaan yang berisi 1500 karakter penuh konteks.",
            },
            "relevance_score": 0.88,
        }
    ]

    valid_chunks_text, citations = generate_citations(chunks)
    assert len(valid_chunks_text) == 1
    assert len(citations) == 1

    # LLM context string must contain the parent_content!
    assert "seluruh paragraf lengkap dari dokumen SOP Perusahaan" in valid_chunks_text[0]
    assert "[1] Dokumen: SOP_Perusahaan.pdf" in valid_chunks_text[0]
    assert "Bagian: Ketentuan Cuti" in valid_chunks_text[0]

    # Citation snippet should be the child snippet
    assert "Anak kalimat 1" in citations[0]["snippet"]
    assert citations[0]["relevanceScore"] == 0.88


def run_all_tests():
    print("Running SOTA RAG 2.0 unit tests...")
    test_indonesian_query_detection()
    print("  [PASS] Indonesian query detection")
    test_search_keyword_extraction()
    print("  [PASS] Search keyword extraction")
    test_coalesce_adjacent_chunks()
    print("  [PASS] Coalesce adjacent chunks (Neighbor Chunk Stitching)")
    test_multi_list_rrf_scoring()
    print("  [PASS] Multi-list Reciprocal Rank Fusion (RRF)")
    test_calculate_calibrated_relevance()
    print("  [PASS] Calibrated relevance scoring")
    test_generate_citations_parent_context()
    print("  [PASS] Parent-Child context injection in citations")
    print("\nALL SOTA RAG 2.0 TESTS PASSED SUCCESSFULLY! [OK]")


if __name__ == "__main__":
    run_all_tests()
