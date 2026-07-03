"""
LocalEmbeddingProvider
======================
Runs embedding models locally via sentence-transformers — no API key required.

Default model: paraphrase-multilingual-MiniLM-L12-v2
  - ~420 MB, 384 dimensions
  - Supports 50+ languages including Bahasa Indonesia
  - Runs on CPU, usable on Hugging Face Spaces free tier

Other good options (set LOCAL_EMBEDDING_MODEL in env):
  - intfloat/multilingual-e5-small          (~117 MB, 384-dim, very fast)
  - sentence-transformers/LaBSE             (~476 MB, 768-dim, best multilingual)
  - BAAI/bge-m3                             (Large, best quality, needs more RAM)
"""

from __future__ import annotations

import asyncio
import logging
from typing import List

from services.ai.providers.base import IEmbeddingProvider

logger = logging.getLogger(__name__)

# Semaphore: limit to 1 concurrent embedding batch to prevent OOM on HF Spaces
_embed_semaphore = asyncio.Semaphore(1)

# Module-level model cache so it is only loaded once per process
_model_cache: dict = {}


def _load_model(model_name: str):
    """Load (or return cached) SentenceTransformer model."""
    if model_name not in _model_cache:
        logger.info(
            f"Loading local embedding model: {model_name} "
            "(first use — downloading if not cached, may take a moment...)"
        )
        from sentence_transformers import SentenceTransformer
        _model_cache[model_name] = SentenceTransformer(model_name)
        logger.info(f"Local embedding model ready: {model_name}")
    return _model_cache[model_name]


class LocalEmbeddingProvider(IEmbeddingProvider):
    """
    Embedding provider that runs sentence-transformers locally on CPU.
    No API key required. Works fully offline after the initial model download.
    """

    async def embed(self, texts: List[str], model: str) -> List[List[float]]:
        """
        Encode texts into embeddings using a local sentence-transformers model.
        Runs in a thread executor so the async event loop is not blocked.
        """
        if not texts:
            return []

        async with _embed_semaphore:
            loop = asyncio.get_event_loop()
            embeddings = await loop.run_in_executor(
                None,  # default ThreadPoolExecutor
                self._encode_sync,
                texts,
                model,
            )
        return embeddings

    def _encode_sync(self, texts: List[str], model_name: str) -> List[List[float]]:
        """Synchronous encoding — runs inside a thread pool executor."""
        st_model = _load_model(model_name)
        vectors = st_model.encode(
            texts,
            batch_size=32,
            show_progress_bar=False,
            normalize_embeddings=True,   # L2-normalize for cosine similarity
            convert_to_numpy=True,
        )
        return [v.tolist() for v in vectors]
