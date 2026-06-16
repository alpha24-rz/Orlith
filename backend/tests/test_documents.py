import pytest
import uuid
import io
import os
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
async def test_document_lifecycle(client: AsyncClient):
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
        json={"name": "Upload Test Workspace", "description": "Testing uploads"},
        headers=headers,
    )
    assert ws_resp.status_code == 200
    workspace_id = ws_resp.json()["id"]

    # 3. Upload Document (Multipart/Form-Data)
    file_content = b"This is a sample text file to verify the documind upload pipeline."
    file_like = io.BytesIO(file_content)

    files = {"file": ("sample.txt", file_like, "text/plain")}
    data = {"workspace_id": workspace_id, "ocr": "false"}

    upload_resp = await client.post(
        "/documents/upload", files=files, data=data, headers=headers
    )
    assert upload_resp.status_code == 200
    doc_data = upload_resp.json()
    assert doc_data["filename"] == "sample.txt"
    assert doc_data["workspace_id"] == workspace_id
    assert doc_data["file_size"] == len(file_content)
    assert "id" in doc_data

    doc_id = doc_data["id"]

    # 4. List Documents
    list_resp = await client.get(f"/documents/{workspace_id}", headers=headers)
    assert list_resp.status_code == 200
    documents_list = list_resp.json()
    assert len(documents_list) >= 1
    assert any(d["id"] == doc_id for d in documents_list)

    # 5. Delete Document
    del_resp = await client.delete(f"/documents/{doc_id}", headers=headers)
    assert del_resp.status_code == 200
    assert "deleted successfully" in del_resp.json()["message"]

    # 6. Verify deleted from list
    list_resp_after = await client.get(f"/documents/{workspace_id}", headers=headers)
    assert list_resp_after.status_code == 200
    assert not any(d["id"] == doc_id for d in list_resp_after.json())
