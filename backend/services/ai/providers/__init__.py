from .base import ILLMProvider, IEmbeddingProvider
from .openai import OpenAIProvider
from .anthropic import AnthropicProvider
from .ollama import OllamaProvider
from .openrouter import OpenRouterProvider
from .gemini import GeminiProvider, InteractionsGeminiProvider

SUPPORTED_PROVIDERS = ["openai", "anthropic", "ollama", "openrouter", "gemini", "gemini_interactions"]


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
    elif provider_name in ("gemini", "gemini_interactions", "gemini-interactions"):
        if not api_key:
            raise ValueError("Gemini requires an API key")
        return InteractionsGeminiProvider(api_key)
    elif provider_name == "ollama":
        # Ollama base URL can be passed as api_key, or an actual API key for Ollama Cloud
        api_key_clean = api_key.strip() if api_key else None
        if not api_key_clean:
            return OllamaProvider(base_url="http://localhost:11434")
        elif api_key_clean.startswith("http://") or api_key_clean.startswith("https://"):
            return OllamaProvider(base_url=api_key_clean)
        else:
            return OllamaProvider(base_url="https://ollama.com", api_key=api_key_clean)
    elif provider_name == "openrouter":
        if not api_key:
            raise ValueError("OpenRouter requires an API key")
        return OpenRouterProvider(api_key)
    else:
        raise ValueError(f"Unsupported provider: {provider_name}")
