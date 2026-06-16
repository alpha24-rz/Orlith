import asyncio
from providers import get_provider_adapter

async def main():
    adapters = [
        get_provider_adapter("openai", "test_key"),
        get_provider_adapter("anthropic", "test_key"),
        get_provider_adapter("gemini", "test_key"),
        get_provider_adapter("ollama", "http://localhost:11434"),
    ]
    
    for adapter in adapters:
        name = adapter.__class__.__name__
        try:
            valid = await adapter.validate_api_key()
            print(f"{name} validate_api_key -> {valid}")
            
            models = await adapter.get_available_models()
            print(f"{name} models -> {len(models)} models available")
        except Exception as e:
            print(f"{name} ERROR -> {e}")

if __name__ == "__main__":
    asyncio.run(main())
