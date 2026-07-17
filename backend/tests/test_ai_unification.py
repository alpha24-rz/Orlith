import pytest
from httpx import AsyncClient, ASGITransport
from core.database import get_db, init_db
from models import User
from services.ai.context.memory import save_user_memory, get_user_memories, delete_user_memory
from services.ai.tools import get_default_registry
import uuid

@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"

@pytest.fixture(scope="module")
async def client():
    from main import app
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

@pytest.mark.anyio
async def test_user_memory_lifecycle(client: AsyncClient):
    # Ensure all tables are created in the test database
    await init_db()

    async for db in get_db():
        # Create a valid test user to satisfy foreign key constraints
        user = User(
            email=f"test_{uuid.uuid4().hex[:6]}@example.com",
            username=f"user_{uuid.uuid4().hex[:6]}",
            hashed_password="hashed_password_placeholder"
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        user_id = user.id
        
        # 1. Save memory
        mem = await save_user_memory(db, user_id, "coding_pref", "use tabs")
        assert mem.user_id == user_id
        assert mem.key == "coding_pref"
        assert mem.value == "use tabs"

        # 2. Get memories
        mems = await get_user_memories(db, user_id)
        assert len(mems) == 1
        assert mems[0].key == "coding_pref"
        assert mems[0].value == "use tabs"

        # 3. Delete memory
        deleted = await delete_user_memory(db, user_id, "coding_pref")
        assert deleted is True

        mems_after = await get_user_memories(db, user_id)
        assert len(mems_after) == 0
        break

@pytest.mark.anyio
async def test_tool_registry():
    registry = get_default_registry()
    schemas = registry.get_schemas()
    
    tool_names = [s["function"]["name"] for s in schemas]
    assert "search_documents" in tool_names
    assert "list_documents" in tool_names
    assert "get_document_metadata" in tool_names
    assert "get_document_content" in tool_names
    assert "semantic_search" in tool_names


@pytest.mark.anyio
async def test_provider_stream_generator_type():
    import inspect
    from services.ai.providers.gemini import GeminiProvider
    from services.ai.providers.openai import OpenAIProvider
    from services.ai.providers.anthropic import AnthropicProvider
    from services.ai.providers.ollama import OllamaProvider

    providers_list = [
        GeminiProvider("dummy_key"),
        OpenAIProvider("dummy_key"),
        AnthropicProvider("dummy_key"),
        OllamaProvider("http://localhost:11434")
    ]
    for provider in providers_list:
        # Call stream_response without awaiting it
        stream = provider.stream_response(
            messages=[{"role": "user", "content": "hi"}],
            model="dummy-model"
        )
        
        # Verify it's not a coroutine
        assert not inspect.iscoroutine(stream), f"{provider.__class__.__name__}.stream_response returned a coroutine"
        # Verify it has __aiter__
        assert hasattr(stream, "__aiter__"), f"{provider.__class__.__name__}.stream_response does not support async iteration"

