from .base import ILLMProvider
from typing import AsyncIterator
import httpx
import logging

logger = logging.getLogger(__name__)

OPENROUTER_BASE = "https://openrouter.ai/api/v1"


class OpenRouterProvider(ILLMProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://documind.ai",
            "X-Title": "DocuMind AI",
        }

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
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{OPENROUTER_BASE}/chat/completions",
                json=payload,
                headers=self._headers(),
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]

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
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }

        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream(
                "POST",
                f"{OPENROUTER_BASE}/chat/completions",
                json=payload,
                headers=self._headers(),
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data: ") and line != "data: [DONE]":
                        import json
                        try:
                            chunk = json.loads(line[6:])
                            content = (
                                chunk["choices"][0]
                                .get("delta", {})
                                .get("content", "")
                            )
                            if content:
                                yield content
                        except Exception:
                            pass

    async def get_available_models(self) -> list[str]:
        """Fetch available models from OpenRouter."""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{OPENROUTER_BASE}/models", headers=self._headers()
                )
                resp.raise_for_status()
                data = resp.json()
            return [m["id"] for m in data.get("data", [])]
        except Exception as e:
            logger.error(f"Failed to fetch OpenRouter models: {e}")
            return []

    async def validate_api_key(self) -> bool:
        """Validate OpenRouter API Key using OpenRouter auth/key endpoint."""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{OPENROUTER_BASE}/auth/key", headers=self._headers()
                )
                return resp.status_code == 200
        except Exception:
            return False
