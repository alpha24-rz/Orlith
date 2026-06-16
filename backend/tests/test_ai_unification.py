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
