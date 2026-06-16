from services.ai.providers.base import ILLMProvider, IEmbeddingProvider
from core.config import settings
from typing import AsyncIterator
import litellm
import logging
from sqlalchemy import select
from models.workspace import Workspace
from models.credential import WorkspaceCredential
from providers.manager import ProviderManager
from core.security import decrypt_api_key
import json

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


class LLMGateway:
    def __init__(self, db=None):
        self.db = db

    async def get_chat_provider(
        self,
        workspace=None,
        override_endpoint_id: str = None,
        override_model: str = None,
    ) -> tuple[ILLMProvider, str]:
        if override_model:
            model = override_model
            if not model.startswith("openrouter/"):
                model = f"openrouter/{model}"
            return OpenRouterAdapter(), model

        if workspace and getattr(workspace, "active_llm_provider", None):
            provider_name = workspace.active_llm_provider
            model_name = workspace.active_llm_model or "default"
            
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
                        return adapter, model_name
                    except Exception as e:
                        logger.error(f"Failed to load provider {provider_name} for workspace {workspace.id}: {e}")

        # Fallback to OpenRouter
        model = settings.LLM_MODEL
        if not model.startswith("openrouter/"):
            model = f"openrouter/{model}"
        adapter = OpenRouterAdapter()
        return adapter, model

    async def get_embedding_provider(
        self, workspace=None
    ) -> tuple[IEmbeddingProvider, str]:
        if workspace and getattr(workspace, "active_embedding_provider", None):
            provider_name = workspace.active_embedding_provider
            model_name = workspace.active_embedding_model or "default"
            
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
                        return adapter, model_name
                    except Exception as e:
                        logger.error(f"Failed to load embedding provider {provider_name} for workspace {workspace.id}: {e}")

        # Fallback to OpenRouter
        model = settings.EMBEDDING_MODEL
        adapter = OpenRouterAdapter()
        return adapter, model
