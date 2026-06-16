from abc import ABC, abstractmethod
from typing import AsyncIterator, List


class ILLMProvider(ABC):
    @abstractmethod
    async def generate_response(
        self,
        messages: list[dict],
        model: str,
        temperature: float = 0.1,
        max_tokens: int = 2048,
    ) -> str: ...

    @abstractmethod
    async def stream_response(
        self,
        messages: list[dict],
        model: str,
        temperature: float = 0.1,
        max_tokens: int = 2048,
    ) -> AsyncIterator[str]: ...

    @abstractmethod
    async def get_available_models(self) -> list[str]: ...

    @abstractmethod
    async def validate_api_key(self) -> bool: ...

    def supports_chat(self, model: str) -> bool:
        # Override in adapter to specifically check if model is a chat model
        return True


class IEmbeddingProvider(ABC):
    @abstractmethod
    async def embed(
        self,
        texts: list[str],
        model: str,
    ) -> list[list[float]]: ...

    def supports_embedding(self, model: str) -> bool:
        # Override in adapter to specifically check if model is an embedding model
        return True
