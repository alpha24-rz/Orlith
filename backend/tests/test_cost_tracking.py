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
async def test_cost_tracking_flow(client: AsyncClient):
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
        json={"name": "Cost Test Workspace", "description": "Testing cost tracking"},
        headers=headers,
    )
    assert ws_resp.status_code == 200
    workspace_id = ws_resp.json()["id"]

    # 3. Simulate usage by executing a request or direct logging test
    # Let's call the GET /usage/{workspace_id} endpoint which should initially return zeros
    usage_resp = await client.get(f"/usage/{workspace_id}", headers=headers)
    assert usage_resp.status_code == 200
    usage_data = usage_resp.json()
    assert usage_data["summary"]["total_cost_usd"] == 0.0
    assert usage_data["summary"]["total_tokens"] == 0

    # Let's call the GET /usage/{workspace_id}/breakdown endpoint
    breakdown_resp = await client.get(f"/usage/{workspace_id}/breakdown", headers=headers)
    assert breakdown_resp.status_code == 200
    breakdown_data = breakdown_resp.json()
    assert len(breakdown_data["breakdown"]) == 14
