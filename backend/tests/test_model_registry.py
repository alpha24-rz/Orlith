import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient
import httpx
from core.database import get_db, init_db
from models import User, UserAPIKey
from core.security import encrypt_api_key
from services.ai.registry import ModelRegistry
import uuid

@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"

@pytest.mark.anyio
async def test_model_registry_openrouter_and_error_handling():
    await init_db()

    async for db in get_db():
        # Create a test user
        user = User(
            email=f"test_{uuid.uuid4().hex[:6]}@example.com",
            username=f"user_{uuid.uuid4().hex[:6]}",
            hashed_password="hashed_password_placeholder"
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        user_id = user.id

        # 1. Save a valid OpenRouter API Key
        encrypted_key = encrypt_api_key("sk-or-v1-test-key-123456")
        or_key = UserAPIKey(
            user_id=user_id,
            provider="openrouter",
            nickname="Test OpenRouter Key",
            encrypted_key=encrypted_key
        )
        db.add(or_key)

        # 2. Save a corrupted key that will fail decryption (InvalidToken)
        corrupted_key = UserAPIKey(
            user_id=user_id,
            provider="openai",
            nickname="Corrupted OpenAI Key",
            encrypted_key="gAAAAABthisisnotavalidtoken"  # bad Fernet payload
        )
        db.add(corrupted_key)
        await db.commit()

        # 3. Mock the httpx call to OpenRouter API
        mock_response = httpx.Response(
            status_code=200,
            json={
                "data": [
                    {
                        "id": "meta-llama/llama-3-70b-instruct",
                        "name": "Llama 3 70B",
                        "context_length": 8192
                    },
                    {
                        "id": "google/gemini-pro",
                        "name": "Gemini Pro",
                        "context_length": 32768
                    }
                ]
            }
        )

        with patch("httpx.AsyncClient.get", return_value=mock_response) as mock_get:
            # Fetch models
            models = await ModelRegistry.get_models(user_id, db, force_refresh=True)

            # Assert OpenRouter models are loaded
            model_ids = [m.id for m in models]
            assert "meta-llama/llama-3-70b-instruct" in model_ids
            assert "google/gemini-pro" in model_ids

            # Verify corrupted OpenAI key did not crash the endpoint, but was skipped
            providers = [m.provider for m in models]
            assert "openai" not in providers
            assert "openrouter" in providers

            # Check that httpx.AsyncClient.get was called with correct URL and headers for OpenRouter
            calls = mock_get.call_args_list
            assert len(calls) == 1
            
            or_call = next(c for c in calls if "openrouter.ai" in c[0][0])
            called_url = or_call[0][0]
            called_headers = or_call[1].get("headers", {})
            assert called_url == "https://openrouter.ai/api/v1/models"
            assert "Bearer sk-or-v1-test-key-123456" in called_headers.values()

        break
