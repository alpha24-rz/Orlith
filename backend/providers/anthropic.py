from .base import ILLMProvider
from typing import AsyncIterator
import httpx
import json

class AnthropicProvider(ILLMProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.anthropic.com/v1"
        self.headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }

    def _build_payload(self, messages: list[dict], model: str, temperature: float, max_tokens: int, stream: bool = False):
        system_parts = []
        chat_messages = []
        for m in messages:
            if m.get("role") == "system":
                system_parts.append(m.get("content") or "")
            else:
                chat_messages.append({"role": m["role"], "content": m.get("content", "")})
        
        payload = {
            "model": model,
            "messages": chat_messages,
            "max_tokens": max_tokens if max_tokens > 0 else 4096,
            "temperature": max(0.0, min(temperature, 1.0)),
        }
        if system_parts:
            payload["system"] = "\n\n".join(system_parts)
        if stream:
            payload["stream"] = True
        return payload

    async def generate_response(
        self,
        messages: list[dict],
        model: str,
        temperature: float = 0.1,
        max_tokens: int = 2048,
    ) -> str:
        payload = self._build_payload(messages, model, temperature, max_tokens)
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{self.base_url}/messages",
                json=payload,
                headers=self.headers,
            )
            resp.raise_for_status()
            data = resp.json()
            return "".join(
                block.get("text", "")
                for block in data.get("content", [])
                if isinstance(block, dict) and block.get("type") == "text"
            )

    async def stream_response(
        self,
        messages: list[dict],
        model: str,
        temperature: float = 0.1,
        max_tokens: int = 2048,
    ) -> AsyncIterator[str]:
        payload = self._build_payload(messages, model, temperature, max_tokens, stream=True)

        async def generate():
            async with httpx.AsyncClient(timeout=60) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/messages",
                    json=payload,
                    headers=self.headers,
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            try:
                                chunk = json.loads(line[6:])
                                if chunk.get("type") == "content_block_delta":
                                    content = chunk.get("delta", {}).get("text", "")
                                    if content:
                                        yield content
                            except Exception:
                                pass

        return generate()

    async def get_available_models(self) -> list[str]:
        return [
            "claude-3-5-sonnet-latest",
            "claude-3-5-sonnet-20240620",
            "claude-3-opus-20240229",
            "claude-3-haiku-20240307",
            "claude-3-5-haiku-latest",
        ]

    async def validate_api_key(self) -> bool:
        try:
            payload = self._build_payload([{"role": "user", "content": "hi"}], "claude-3-haiku-20240307", 0.1, 5)
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{self.base_url}/messages",
                    json=payload,
                    headers=self.headers,
                )
                return resp.status_code == 200
        except Exception:
            return False

    def supports_chat(self, model: str) -> bool:
        return True

    def supports_embedding(self, model: str) -> bool:
        return False
