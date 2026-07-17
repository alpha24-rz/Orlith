from services.ai.providers.base import ILLMProvider, IEmbeddingProvider
from core.config import settings
from typing import AsyncIterator
import litellm
import logging
from sqlalchemy import select
from models.workspace import Workspace
from models.credential import WorkspaceCredential
from models.api_key import UserAPIKey
from services.ai.providers.manager import ProviderManager
from services.ai.providers import get_provider_adapter
from services.ai.providers.gemini import GeminiProvider, InteractionsGeminiProvider
from services.ai.providers.local_embedding import LocalEmbeddingProvider
from core.security import decrypt_api_key
import json
from services.ai.health_monitor import openai_health, gemini_health, huggingface_health

logger = logging.getLogger(__name__)

# Disable LiteLLM logging
litellm.suppress_debug_info = True

class OpenRouterAdapter(ILLMProvider, IEmbeddingProvider):
    def __init__(self):
        self.api_key = settings.OPENROUTER_API_KEY
        if not self.api_key:
            logger.warning("OPENROUTER_API_KEY is not set. AI features will fail.")

    async def generate_response(
        self,
        messages: list[dict],
        model: str,
        temperature: float = 0.1,
        max_tokens: int = 2048,
    ) -> str:
        response = await litellm.acompletion(
            model=model,
            messages=messages,
            api_key=self.api_key,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content

    async def stream_response(
        self,
        messages: list[dict],
        model: str,
        temperature: float = 0.1,
        max_tokens: int = 2048,
    ) -> AsyncIterator[str]:
        response = await litellm.acompletion(
            model=model,
            messages=messages,
            api_key=self.api_key,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )
        async for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def get_available_models(self) -> list[str]:
        return [settings.LLM_MODEL, settings.EMBEDDING_MODEL]

    async def validate_api_key(self) -> bool:
        return bool(self.api_key)

    async def embed(self, texts: list[str], model: str) -> list[list[float]]:
        response = await litellm.aembedding(
            model=model,
            input=texts,
            api_key=self.api_key,
        )
        return [item["embedding"] for item in response.data]


# The LocalEmbeddingProvider runs sentence-transformers locally.
# It is imported from services.ai.providers.local_embedding.py.


class LLMGateway:
    def __init__(self, db=None):
        self.db = db
    async def get_chat_provider(
        self,
        workspace=None,
        override_endpoint_id: str = None,
        override_model: str = None,
    ) -> tuple[ILLMProvider, str]:
        provider_name = override_endpoint_id
        model_name = override_model

        # If not overridden, read from workspace settings
        if not provider_name or not model_name:
            if workspace and getattr(workspace, "active_llm_provider", None):
                provider_name = workspace.active_llm_provider
                model_name = workspace.active_llm_model or "default"

        if provider_name and model_name:
            if self.db:
                # 1. Check workspace credentials
                result = await self.db.execute(
                    select(WorkspaceCredential).where(
                        WorkspaceCredential.workspace_id == workspace.id if workspace else False,
                        WorkspaceCredential.provider == provider_name
                    )
                )
                cred = result.scalars().first()
                if cred:
                    try:
                        cred_json = json.loads(decrypt_api_key(cred.encrypted_credential_json))
                        adapter = ProviderManager.get_provider(provider_name, cred_json)
                        return adapter, model_name
                    except Exception as e:
                        logger.error(f"Failed to load provider {provider_name}: {e}")

                # 2. Check user-level API key
                if workspace:
                    result = await self.db.execute(
                        select(UserAPIKey).where(
                            UserAPIKey.user_id == workspace.owner_id,
                            UserAPIKey.provider == provider_name
                        )
                    )
                    user_key = result.scalars().first()
                    if user_key:
                        if user_key.is_active is False:
                            raise ValueError(f"Provider '{provider_name}' is currently disabled in your API Keys settings.")
                        try:
                            raw_key = decrypt_api_key(user_key.encrypted_key)
                            adapter = get_provider_adapter(provider_name, raw_key)
                            return adapter, model_name
                        except Exception as e:
                            logger.error(f"Failed to load user provider {provider_name} key: {e}")

            # 3. Fallback to system settings for Gemini
            if provider_name in ("gemini_interactions", "gemini-interactions") and settings.GEMINI_API_KEY:
                return InteractionsGeminiProvider(settings.GEMINI_API_KEY), model_name
            if provider_name == "gemini" and settings.GEMINI_API_KEY:
                return InteractionsGeminiProvider(settings.GEMINI_API_KEY), model_name
 

            # 4. Fallback to system settings for OpenRouter
            if provider_name == "openrouter" and settings.OPENROUTER_API_KEY:
                actual_model = model_name
                if not actual_model.startswith("openrouter/"):
                    actual_model = f"openrouter/{actual_model}"
                return OpenRouterAdapter(), actual_model

        # Fallback to Gemini if configured and not offline
        if settings.GEMINI_API_KEY and gemini_health.state != "Offline":
            return InteractionsGeminiProvider(settings.GEMINI_API_KEY), "gemini-3.5-flash"

        # Fallback to OpenRouter (OpenAI fallback)
        model = settings.LLM_MODEL
        if not model.startswith("openrouter/"):
            model = f"openrouter/{model}"
        adapter = OpenRouterAdapter()
        return adapter, model

    async def get_embedding_provider(
        self, workspace=None
    ) -> tuple[IEmbeddingProvider, str]:
        # 1. Priority override: system-level local huggingface embeddings
        if settings.EMBEDDING_PROVIDER == "huggingface":
            model_name = settings.EMBEDDING_MODEL
            return LocalEmbeddingProvider(), model_name

        # 2. Workspace active configuration
        if workspace and getattr(workspace, "active_embedding_provider", None):
            provider_name = workspace.active_embedding_provider
            model_name = workspace.active_embedding_model or "default"
            
            if provider_name in ("huggingface", "local"):
                actual_model = model_name if model_name != "default" else settings.EMBEDDING_MODEL
                return LocalEmbeddingProvider(), actual_model
            
            # Fallback to system-level Gemini API key if provider is Gemini
            if provider_name == "gemini" and settings.GEMINI_API_KEY:
                return GeminiProvider(settings.GEMINI_API_KEY), model_name or "models/gemini-embedding-001"

            if self.db:
                result = await self.db.execute(
                    select(WorkspaceCredential).where(
                        WorkspaceCredential.workspace_id == workspace.id,
                        WorkspaceCredential.provider == provider_name
                    )
                )
                cred = result.scalars().first()
                if cred:
                    try:
                        cred_json = json.loads(decrypt_api_key(cred.encrypted_credential_json))
                        adapter = ProviderManager.get_provider(provider_name, cred_json)
                        if isinstance(adapter, IEmbeddingProvider):
                            return adapter, model_name
                    except Exception as e:
                        logger.error(f"Failed to load embedding provider {provider_name} for workspace {workspace.id}: {e}")

                # Check UserAPIKey fallback
                result = await self.db.execute(
                    select(UserAPIKey).where(
                        UserAPIKey.user_id == workspace.owner_id,
                        UserAPIKey.provider == provider_name
                    )
                )
                user_key = result.scalars().first()
                if user_key:
                    try:
                        raw_key = decrypt_api_key(user_key.encrypted_key)
                        adapter = get_provider_adapter(provider_name, raw_key)
                        if isinstance(adapter, IEmbeddingProvider):
                            return adapter, model_name
                    except Exception as e:
                        logger.error(f"Failed to load user embedding provider {provider_name} key: {e}")

        # 3. Fallback to Gemini if configured
        if settings.GEMINI_API_KEY:
            return GeminiProvider(settings.GEMINI_API_KEY), "models/gemini-embedding-001"

        # 4. Fallback to OpenRouter
        model = settings.EMBEDDING_MODEL
        adapter = OpenRouterAdapter()
        return adapter, model
