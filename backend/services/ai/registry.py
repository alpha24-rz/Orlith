import time
import logging
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx

from models.api_key import UserAPIKey
from core.security import decrypt_api_key
from services.ai.providers import get_provider_adapter
from services.ai.providers.base import ILLMProvider

logger = logging.getLogger(__name__)

class ModelInfo(BaseModel):
    id: str
    display_name: str
    provider: str
    context_window: Optional[int] = None
    supports_streaming: bool = True
    is_available: bool = True

# Cache: user_id -> (timestamp, list of ModelInfo)
_registry_cache: Dict[str, tuple[float, List[ModelInfo]]] = {}
CACHE_TTL = 3600  # 1 hour

NATIVE_MODELS = {
    "openai": [
        {"id": "gpt-4o", "display_name": "GPT-4o", "context_window": 128000},
        {"id": "gpt-4o-mini", "display_name": "GPT-4o Mini", "context_window": 128000},
        {"id": "o1-mini", "display_name": "o1-mini", "context_window": 128000},
        {"id": "gpt-4-turbo", "display_name": "GPT-4 Turbo", "context_window": 128000},
    ],
    "anthropic": [
        {"id": "claude-3-5-sonnet-20240620", "display_name": "Claude 3.5 Sonnet", "context_window": 200000},
        {"id": "claude-3-opus-20240229", "display_name": "Claude 3 Opus", "context_window": 200000},
        {"id": "claude-3-haiku-20240307", "display_name": "Claude 3 Haiku", "context_window": 200000},
    ],
    "gemini": [
        {"id": "gemini-3.5-flash", "display_name": "Gemini 3.5 Flash", "context_window": 1000000},
        {"id": "gemini-3.1-flash-image", "display_name": "Gemini 3.1 Flash Image", "context_window": 1000000},
        {"id": "gemini-2.0-flash", "display_name": "Gemini 2.0 Flash", "context_window": 1000000},
        {"id": "gemini-1.5-pro", "display_name": "Gemini 1.5 Pro", "context_window": 2000000},
        {"id": "gemini-1.5-flash", "display_name": "Gemini 1.5 Flash", "context_window": 1000000},
    ]
}

class ModelRegistry:
    @staticmethod
    def invalidate_cache(user_id: str):
        """Invalidate cache for a specific user."""
        if user_id in _registry_cache:
            del _registry_cache[user_id]
            logger.info(f"Invalidated model registry cache for user {user_id}")

    @staticmethod
    async def get_models(user_id: str, db: AsyncSession, force_refresh: bool = False) -> List[ModelInfo]:
        """
        Get all models available to the user from active/connected providers.
        """
        now = time.time()
        if not force_refresh and user_id in _registry_cache:
            timestamp, cached_models = _registry_cache[user_id]
            if now - timestamp < CACHE_TTL:
                return cached_models

        logger.info(f"Fetching available models for user {user_id}...")
        models: List[ModelInfo] = []

        # 1. Fetch user API keys
        result = await db.execute(
            select(UserAPIKey).where(UserAPIKey.user_id == user_id)
        )
        api_keys = result.scalars().all()
        connected_providers = {}
        for key in api_keys:
            try:
                connected_providers[key.provider] = decrypt_api_key(key.encrypted_key)
            except Exception as e:
                logger.error(
                    f"Failed to decrypt API key for provider {key.provider} of user {user_id}: {e}"
                )

        # 2. Add Ollama models (if Ollama is running and user-level key/provider is connected)
        if "ollama" in connected_providers:
            try:
                ollama_adapter = get_provider_adapter("ollama", connected_providers["ollama"])
                ollama_models = await ollama_adapter.get_available_models()
                for model_name in ollama_models:
                    models.append(
                        ModelInfo(
                            id=model_name,
                            display_name=model_name,
                            provider="ollama",
                            context_window=8192,
                            supports_streaming=True,
                            is_available=True
                        )
                    )
            except Exception as e:
                logger.debug(f"Ollama is offline or failed: {e}")

        # 3. Add OpenAI models
        if "openai" in connected_providers:
            for m in NATIVE_MODELS["openai"]:
                models.append(
                    ModelInfo(
                        id=m["id"],
                        display_name=m["display_name"],
                        provider="openai",
                        context_window=m["context_window"],
                        supports_streaming=True,
                        is_available=True
                    )
                )

        # 4. Add Anthropic models
        if "anthropic" in connected_providers:
            for m in NATIVE_MODELS["anthropic"]:
                models.append(
                    ModelInfo(
                        id=m["id"],
                        display_name=m["display_name"],
                        provider="anthropic",
                        context_window=m["context_window"],
                        supports_streaming=True,
                        is_available=True
                    )
                )

        # 5. Add Gemini models (always add if system-level GEMINI_API_KEY is configured)
        from core.config import settings
        if "gemini" in connected_providers or "gemini_interactions" in connected_providers or settings.GEMINI_API_KEY:
            for m in NATIVE_MODELS["gemini"]:
                models.append(
                    ModelInfo(
                        id=m["id"],
                        display_name=m["display_name"],
                        provider="gemini",
                        context_window=m["context_window"],
                        supports_streaming=True,
                        is_available=True
                    )
                )

        # 6. Add OpenRouter models dynamically
        if "openrouter" in connected_providers:
            or_key = connected_providers["openrouter"]
            try:
                headers = {
                    "Authorization": f"Bearer {or_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://documind.ai",
                    "X-Title": "DocuMind AI",
                }
                async with httpx.AsyncClient(timeout=10) as client:
                    resp = await client.get("https://openrouter.ai/api/v1/models", headers=headers)
                    if resp.status_code == 200:
                        data = resp.json().get("data", [])
                        for item in data:
                            models.append(
                                ModelInfo(
                                    id=item.get("id"),
                                    display_name=item.get("name") or item.get("id"),
                                    provider="openrouter",
                                    context_window=item.get("context_length"),
                                    supports_streaming=True,
                                    is_available=True
                                )
                            )
            except Exception as e:
                logger.error(f"Failed to fetch OpenRouter models: {e}")

        # Update cache
        _registry_cache[user_id] = (now, models)
        return models
