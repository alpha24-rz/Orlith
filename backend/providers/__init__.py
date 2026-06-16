from .base import ILLMProvider, IEmbeddingProvider
from .openai import OpenAIProvider
from .anthropic import AnthropicProvider
from .ollama import OllamaProvider
from .openrouter import OpenRouterProvider
from .gemini import GeminiProvider

SUPPORTED_PROVIDERS = ["openai", "anthropic", "ollama", "openrouter", "gemini"]


def get_provider_adapter(
    provider_name: str, api_key: str = None
) -> ILLMProvider | IEmbeddingProvider:
    provider_name = provider_name.lower()
    if provider_name == "claude":
        provider_name = "anthropic"
    if provider_name == "openai":
        if not api_key:
            raise ValueError("OpenAI requires an API key")
        return OpenAIProvider(api_key)
    elif provider_name == "anthropic":
        if not api_key:
            raise ValueError("Anthropic requires an API key")
        return AnthropicProvider(api_key)
    elif provider_name == "gemini":
        if not api_key:
            raise ValueError("Gemini requires an API key")
        return GeminiProvider(api_key)
    elif provider_name == "ollama":
        # Ollama base URL can be passed as api_key for now, or just use default
        base_url = api_key if api_key else "http://localhost:11434"
        return OllamaProvider(base_url)
    elif provider_name == "openrouter":
        if not api_key:
            raise ValueError("OpenRouter requires an API key")
        return OpenRouterProvider(api_key)
    else:
        raise ValueError(f"Unsupported provider: {provider_name}")
