def build_chunk_uid(document_id: str, chunk_index: int) -> str:
    """Standardizes chunk UID generation across the retrieval stack."""
    return f"{document_id}_{chunk_index}"
