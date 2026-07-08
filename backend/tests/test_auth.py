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


@pytest.mark.anyio
async def test_demo_auth_by_ip(client: AsyncClient):
    # 1. Call demo endpoint with IP 1
    headers_ip1 = {"X-Forwarded-For": "1.1.1.1"}
    response1 = await client.post("/auth/demo", headers=headers_ip1)
    assert response1.status_code == 200
    data1 = response1.json()
    assert "access_token" in data1
    email1 = data1["user"]["email"]
    assert email1.startswith("demo_")

    # 2. Call demo endpoint with IP 2
    headers_ip2 = {"X-Forwarded-For": "2.2.2.2"}
    response2 = await client.post("/auth/demo", headers=headers_ip2)
    assert response2.status_code == 200
    data2 = response2.json()
    email2 = data2["user"]["email"]
    assert email2.startswith("demo_")
    
    # 3. Verify that IP 1 and IP 2 got different demo users
    assert email1 != email2

    # 4. Call again with IP 1, it should retrieve the same user
    response1_again = await client.post("/auth/demo", headers=headers_ip1)
    assert response1_again.status_code == 200
    data1_again = response1_again.json()
    assert data1_again["user"]["email"] == email1

