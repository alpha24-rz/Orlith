"""
Tests for the core API endpoints: health check, root, CORS.
"""

import pytest
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
async def test_root(client: AsyncClient):
    """Root endpoint returns ok status."""
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "DocuMind" in data["name"]


@pytest.mark.anyio
async def test_health(client: AsyncClient):
    """/health returns healthy status with expected fields."""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "service" in data
    assert "version" in data
    assert "environment" in data
    assert "timestamp" in data


@pytest.mark.anyio
async def test_health_cors_headers(client: AsyncClient):
    """CORS preflight on /health should be handled."""
    response = await client.options(
        "/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    # FastAPI CORS middleware returns 200 for OPTIONS
    assert response.status_code == 200


@pytest.mark.anyio
async def test_docs_available(client: AsyncClient):
    """OpenAPI /docs should be reachable."""
    response = await client.get("/docs")
    assert response.status_code == 200


@pytest.mark.anyio
async def test_openapi_json(client: AsyncClient):
    """OpenAPI schema should include our custom endpoints."""
    response = await client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    paths = schema.get("paths", {})
    assert "/health" in paths
    assert "/" in paths
