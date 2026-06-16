import pytest
import uuid
from httpx import AsyncClient, ASGITransport


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
async def test_compare_flow(client: AsyncClient):
    # 1. Register and Login to get Auth token
    unique_id = uuid.uuid4().hex[:6]
    email = f"user_{unique_id}@example.com"
    password = "password123"

    reg_resp = await client.post(
        "/auth/register", json={"email": email, "password": password}
    )
    assert reg_resp.status_code == 201

    login_resp = await client.post(
        "/auth/login", json={"email": email, "password": password}
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Create Workspace
    ws_resp = await client.post(
        "/workspaces",
        json={"name": "Compare Test Workspace", "description": "Testing compare"},
        headers=headers,
    )
    assert ws_resp.status_code == 200
    workspace_id = ws_resp.json()["id"]

    # 3. Test Voting endpoint
    vote_payload = {
        "query_text": "Apa kebijakan cuti?",
        "model_a": "gpt-4o-mini",
        "model_b": "claude-3-haiku-20240307",
        "response_a": "Cuti tahunan 12 hari.",
        "response_b": "Cuti tahunan Anda adalah 12 hari kerja.",
        "vote": "model_b"
    }

    vote_resp = await client.post(
        f"/compare/{workspace_id}/vote",
        json=vote_payload,
        headers=headers
    )
    assert vote_resp.status_code == 200
    assert "vote_id" in vote_resp.json()

    # 4. Test list votes history
    history_resp = await client.get(
        f"/compare/{workspace_id}/votes",
        headers=headers
    )
    assert history_resp.status_code == 200
    history_data = history_resp.json()
    assert "votes" in history_data
    assert len(history_data["votes"]) == 1
    assert history_data["votes"][0]["vote"] == "model_b"
