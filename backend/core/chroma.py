import chromadb
from chromadb.config import Settings
from core.config import settings
import os

_client: chromadb.ClientAPI | None = None


def get_chroma_client() -> chromadb.ClientAPI:
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
    )
