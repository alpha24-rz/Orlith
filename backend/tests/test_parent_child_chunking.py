import pytest
from services.chunking import split_pages_hierarchical, add_window_parent_context

def test_split_pages_hierarchical():
    pages = [
        {"text": "This is paragraph one. It has some sentences.\n\nThis is paragraph two. It is also here.\n\nThis is paragraph three. Still in page one.", "page_number": 1},
        {"text": "This is page two paragraph one. It is longer and has some details.\n\nThis is page two paragraph two.", "page_number": 2}
    ]
    # Test hierarchical splitting
    child_chunks = split_pages_hierarchical(
        pages,
        child_size=100,      # Small child size
        parent_size=500,     # Parent size
        child_overlap=10
    )
    
    assert len(child_chunks) > 0
    # Every child chunk must have parent_content populated
    for chunk in child_chunks:
        assert "text" in chunk
        assert "parent_content" in chunk
        assert len(chunk["parent_content"]) >= len(chunk["text"])
        # The child text must be a substring of the parent content
        assert chunk["text"] in chunk["parent_content"]
        assert chunk["page_number"] in [1, 2]

def test_add_window_parent_context():
    chunks = [
        {"text": "Chunk 1 content.", "page_number": 1, "chunk_index": 0},
        {"text": "Chunk 2 content.", "page_number": 1, "chunk_index": 1},
        {"text": "Chunk 3 content.", "page_number": 2, "chunk_index": 2}
    ]
    
    result = add_window_parent_context(chunks)
    assert len(result) == 3
    
    # First chunk parent should be "Chunk 1 content. \n\n Chunk 2 content."
    assert result[0]["parent_content"] == "Chunk 1 content.\n\nChunk 2 content."
    
    # Second chunk parent should be all three merged
    assert result[1]["parent_content"] == "Chunk 1 content.\n\nChunk 2 content.\n\nChunk 3 content."
    
    # Third chunk parent should be Chunk 2 + Chunk 3
    assert result[2]["parent_content"] == "Chunk 2 content.\n\nChunk 3 content."
