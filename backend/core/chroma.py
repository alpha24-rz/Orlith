from __future__ import annotations
import chromadb
from chromadb.config import Settings
from chromadb.api.types import EmbeddingFunction, Documents, Embeddings
from core.config import settings
import os

_client: chromadb.PersistentClient | None = None


class NoneEmbeddingFunction(EmbeddingFunction):
    """A dummy embedding function to prevent ChromaDB from loading its default ONNX/sentence-transformers model into RAM."""
    def __init__(self) -> None:
        pass

    def __call__(self, input: Documents) -> Embeddings:
        # Since we compute embeddings externally via the configured AI provider, 
        # this function should never be called.
        return []


def get_chroma_client() -> chromadb.PersistentClient:
    global _client
    if _client is None:
        os.makedirs(settings.CHROMA_PERSIST_DIR, exist_ok=True)
        _client = chromadb.PersistentClient(
            path=settings.CHROMA_PERSIST_DIR,
            settings=Settings(anonymized_telemetry=False),
        )
    return _client


def get_workspace_collection(workspace_id: str) -> chromadb.Collection:
    """Each workspace gets its own isolated ChromaDB collection."""
    client = get_chroma_client()
    return client.get_or_create_collection(
        name=f"workspace_{workspace_id}",
        metadata={"hnsw:space": "cosine"},
        embedding_function=NoneEmbeddingFunction(),
    )
