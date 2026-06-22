from fastapi import (
    APIRouter,
    Depends,
    UploadFile,
    File,
    Form,
    HTTPException,
    BackgroundTasks,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.database import get_db
from models import Document, Workspace
from schemas import DocumentResponse
from services.file_storage import storage_service
from services.ingestion import process_document, broadcast_status
from core.chroma import get_workspace_collection
from core.websocket import manager
from api.deps import get_workspace
from typing import List
import os
import hashlib

router = APIRouter(prefix="/documents", tags=["Documents"])


@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    workspace_id: str = Form(...),
    file: UploadFile = File(...),
    ocr: bool = Form(False),
    db: AsyncSession = Depends(get_db),
):
    # Validate workspace
    workspace = await get_workspace(workspace_id, db)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    from services.validation import WorkspaceValidator
    status = await WorkspaceValidator.get_workspace_status(db, workspace)
    if status != "READY":
        raise HTTPException(status_code=400, detail="Configure AI Provider before uploading documents.")

    # Save physical file to ./uploads
    file_path = await storage_service.save_upload_file(file)

    # Calculate file size
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    # Calculate content hash (SHA-256)
    hasher = hashlib.sha256()
    file.file.seek(0)
    while chunk := file.file.read(8192):
        hasher.update(chunk)
    content_hash = hasher.hexdigest()
    file.file.seek(0)

    # Extract file extension for type
    ext = file.filename.split(".")[-1].upper() if "." in file.filename else "unknown"

    document = Document(
        workspace_id=workspace.id,
        filename=file.filename,
        file_path=file_path,
        file_type=ext,
        file_size=file_size,
        status="uploading",
        content_hash=content_hash,
        metadata_json={"ocr_applied": False, "page_count": 0},
    )

    db.add(document)
    await db.commit()
    await db.refresh(document)

    # Broadcast initial "uploading" status
    await broadcast_status(document, db)

    # Enqueue ingestion background task (which will transition status: uploading -> processing -> ready/error)
    background_tasks.add_task(process_document, document.id, db, ocr)

    return document


@router.get("/{workspace_id}", response_model=List[DocumentResponse])
async def list_documents(workspace_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Document).where(Document.workspace_id == workspace_id)
    )
    return result.scalars().all()


@router.post("/{document_id}/process")
async def reprocess_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    ocr: bool = False,
    db: AsyncSession = Depends(get_db),
):
    document = await db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Enqueue ingestion background task again
    background_tasks.add_task(process_document, document.id, db, ocr)

    return {"message": "Document re-processing started"}


@router.get("/{document_id}/status")
async def get_document_status(document_id: str, db: AsyncSession = Depends(get_db)):
    document = await db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    return {
        "id": document.id,
        "status": document.status,
        "chunks": document.metadata.get("chunk_count", 0) if document.metadata else 0,
        "error": document.metadata.get("error") if document.metadata else None,
    }


@router.delete("/{document_id}")
async def delete_document(document_id: str, db: AsyncSession = Depends(get_db)):
    document = await db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete from local file storage
    try:
        storage_service.delete_file(document.file_path)
    except Exception as e:
        print(f"Error deleting local file: {e}")

    # Delete from ChromaDB
    try:
        collection = get_workspace_collection(document.workspace_id)
        collection.delete(where={"document_id": document.id})
    except Exception as e:
        print(f"Error deleting from ChromaDB: {e}")

    # Delete from SQLite
    await db.delete(document)
    await db.commit()

    return {"message": "Document deleted successfully"}


@router.get("/{document_id}/download")
async def download_document(document_id: str, db: AsyncSession = Depends(get_db)):
    document = await db.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not os.path.exists(document.file_path):
        raise HTTPException(status_code=404, detail="Physical file not found")

    media_type = "application/pdf" if document.file_type.upper() == "PDF" else "application/octet-stream"
    
    return FileResponse(
        path=document.file_path,
        media_type=media_type,
        filename=document.filename,
        content_disposition_type="inline"
    )


@router.websocket("/ws/{workspace_id}")
async def websocket_endpoint(websocket: WebSocket, workspace_id: str):
    await manager.connect(workspace_id, websocket)
    try:
        while True:
            # Keep the connection open and listen for heartbeat/disconnect
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(workspace_id, websocket)
    except Exception:
        manager.disconnect(workspace_id, websocket)
