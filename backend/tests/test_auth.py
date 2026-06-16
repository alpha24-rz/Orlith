import pytest
import uuid
from httpx import AsyncClient, ASGITransport


@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="module")
async def client():
    """ASGI test client using httpx — no real server required."""
    from main import app

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


@pytest.mark.anyio
async def test_auth_flow(client: AsyncClient):
    # 1. Register a new user
    unique_id = uuid.uuid4().hex[:6]
    email = f"test_{unique_id}@example.com"
    password = "password123"

    register_payload = {"email": email, "password": password}

    # Test POST /auth/register
    response = await client.post("/auth/register", json=register_payload)
    assert response.status_code == 201
    user_data = response.json()
    assert user_data["email"] == email
    assert "id" in user_data
    assert "hashed_password" not in user_data  # Ensure sensitive data is not exposed

    # Test duplicate register should fail
    response_dup = await client.post("/auth/register", json=register_payload)
    assert response_dup.status_code == 400
    assert "Email already registered" in response_dup.json()["detail"]

    # 2. Test POST /auth/login with correct credentials
    login_payload = {"email": email, "password": password}
    response = await client.post("/auth/login", json=login_payload)
    assert response.status_code == 200
    login_data = response.json()
    assert "access_token" in login_data
    assert login_data["token_type"] == "bearer"
    assert login_data["user"]["email"] == email

    token = login_data["access_token"]

    # 3. Test POST /auth/login with incorrect credentials
    login_fail_payload = {"email": email, "password": "wrongpassword"}
    response_fail = await client.post("/auth/login", json=login_fail_payload)
    assert response_fail.status_code == 401
    assert "Incorrect email or password" in response_fail.json()["detail"]

    # 4. Test GET /auth/me with valid token
    headers = {"Authorization": f"Bearer {token}"}
    response = await client.get("/auth/me", headers=headers)
    assert response.status_code == 200
    me_data = response.json()
    assert me_data["email"] == email
    assert me_data["id"] == user_data["id"]

    # 5. Test GET /auth/me with invalid token
    headers_invalid = {"Authorization": "Bearer invalid_token"}
    response = await client.get("/auth/me", headers=headers_invalid)
    assert response.status_code == 401
