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
async def test_workspace_analytics(client: AsyncClient):
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
        json={"name": "Analytics Test Workspace", "description": "Testing analytics"},
        headers=headers,
    )
    assert ws_resp.status_code == 200
    workspace_id = ws_resp.json()["id"]

    # 3. Call GET /workspaces/{workspace_id}/analytics
    analytics_resp = await client.get(
        f"/workspaces/{workspace_id}/analytics", headers=headers
    )
    assert analytics_resp.status_code == 200
    data = analytics_resp.json()

    # 4. Verify fields exist and have correct structure
    assert "metrics" in data
    assert "usage_trend" in data
    assert "top_documents" in data
    assert "query_topics" in data
    assert "members" in data

    # 5. Verify members list contains the owner and fallback team members
    assert len(data["members"]) >= 5
    owner = data["members"][0]
    assert owner["role"] == "Owner"
    assert owner["email"] == email

    # 6. Verify default metrics
    metrics = data["metrics"]
    assert len(metrics) == 4
    for m in metrics:
        assert "label" in m
        assert "value" in m
        assert "target" in m
        assert "status" in m
        assert "trend" in m

    # 7. Verify usage trend contains 14 days
    assert len(data["usage_trend"]) == 14
    for point in data["usage_trend"]:
        assert "date" in point
        assert "queries" in point
        assert "documents" in point
        assert "extractions" in point

    # 8. Check query topics fallback
    assert len(data["query_topics"]) > 0
    assert (
        any(t["topic"] == "Other" for t in data["query_topics"])
        or len(data["query_topics"]) == 6
    )
