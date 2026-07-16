import json
from .base import ILLMProvider, IEmbeddingProvider
from .openai import OpenAIProvider
from .anthropic import AnthropicProvider
from .ollama import OllamaProvider
from .openrouter import OpenRouterProvider
from .gemini import GeminiProvider

SUPPORTED_PROVIDERS = ["openai", "anthropic", "ollama", "openrouter", "gemini"]

class ProviderManager:
    @staticmethod
    def get_provider(provider_name: str, credential_json: dict) -> ILLMProvider | IEmbeddingProvider:
        provider_name = provider_name.lower()
        if provider_name == "claude":
            provider_name = "anthropic"
            
        if provider_name == "openai":
            api_key = credential_json.get("api_key")
            if not api_key:
                raise ValueError("OpenAI requires an api_key in credentials")
            return OpenAIProvider(api_key)
            
        elif provider_name == "anthropic":
            api_key = credential_json.get("api_key")
            if not api_key:
                raise ValueError("Anthropic requires an api_key in credentials")
            return AnthropicProvider(api_key)
            
        elif provider_name == "gemini":
            api_key = credential_json.get("api_key")
            if not api_key:
                raise ValueError("Gemini requires an api_key in credentials")
            return GeminiProvider(api_key)
            
        elif provider_name == "ollama":
            api_key_or_url = credential_json.get("base_url") or credential_json.get("api_key")
            if not api_key_or_url:
                return OllamaProvider(base_url="http://localhost:11434")
            elif api_key_or_url.startswith("http://") or api_key_or_url.startswith("https://"):
                return OllamaProvider(base_url=api_key_or_url)
            else:
                return OllamaProvider(base_url="https://ollama.com", api_key=api_key_or_url)
            
        elif provider_name == "openrouter":
            api_key = credential_json.get("api_key")
            if not api_key:
                raise ValueError("OpenRouter requires an api_key in credentials")
            return OpenRouterProvider(api_key)
            
        else:
            raise ValueError(f"Unsupported provider: {provider_name}")
