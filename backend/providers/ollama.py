from .base import ILLMProvider, IEmbeddingProvider
from typing import AsyncIterator
import httpx
import json
import logging

logger = logging.getLogger(__name__)

class OllamaProvider(ILLMProvider, IEmbeddingProvider):
    def __init__(self, base_url: str = "http://localhost:11434", api_key: str = None):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    def _headers(self) -> dict:
        headers = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def generate_response(
        self,
        messages: list[dict],
        model: str,
        temperature: float = 0.1,
        max_tokens: int = 2048,
    ) -> str:
        payload = {
            "model": model,
            "messages": messages,
            "options": {
                "temperature": temperature,
            },
            "stream": False,
        }
        if max_tokens > 0:
            payload["options"]["num_predict"] = max_tokens

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{self.base_url}/api/chat",
                json=payload,
                headers=self._headers(),
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("message", {}).get("content", "")

    async def stream_response(
        self,
        messages: list[dict],
        model: str,
        temperature: float = 0.1,
        max_tokens: int = 2048,
    ) -> AsyncIterator[str]:
        payload = {
            "model": model,
            "messages": messages,
            "options": {
                "temperature": temperature,
            },
            "stream": True,
        }
        if max_tokens > 0:
            payload["options"]["num_predict"] = max_tokens

        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/api/chat",
                json=payload,
                headers=self._headers(),
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line:
                        try:
                            chunk = json.loads(line)
                            content = chunk.get("message", {}).get("content", "")
                            if content:
                                yield content
                        except Exception:
                            pass

    async def get_available_models(self) -> list[str]:
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                resp = await client.get(f"{self.base_url}/api/tags", headers=self._headers())
                if resp.status_code == 200:
                    data = resp.json()
                    return [m["name"] for m in data.get("models", [])]
        except Exception as e:
            logger.debug(f"Ollama offline or tags call failed: {e}")
        return []

    async def validate_api_key(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                # For cloud (with api_key), validate via /api/tags endpoint
                # For local, a simple GET to the base URL is sufficient
                if self.api_key:
                    resp = await client.get(
                        f"{self.base_url}/api/tags",
                        headers=self._headers(),
                    )
                else:
                    resp = await client.get(self.base_url)
                return resp.status_code == 200
        except Exception:
            return False

    async def embed(self, texts: list[str], model: str) -> list[list[float]]:
        # Try batch embedding via modern /api/embed first
        try:
            payload = {
                "model": model,
                "input": texts
            }
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"{self.base_url}/api/embed",
                    json=payload,
                    headers=self._headers(),
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if "embeddings" in data:
                        return data["embeddings"]
        except Exception as e:
            logger.warning(f"Ollama batch /api/embed failed: {e}. Falling back to sequential /api/embeddings...")

        # Fallback to sequential /api/embeddings for older Ollama versions
        embeddings = []
        async with httpx.AsyncClient(timeout=60) as client:
            for text in texts:
                payload = {
                    "model": model,
                    "prompt": text
                }
                resp = await client.post(
                    f"{self.base_url}/api/embeddings",
                    json=payload,
                    headers=self._headers(),
                )
                resp.raise_for_status()
                data = resp.json()
                embeddings.append(data.get("embedding", []))
        return embeddings

    def supports_chat(self, model: str) -> bool:
        return True

    def supports_embedding(self, model: str) -> bool:
        return True
