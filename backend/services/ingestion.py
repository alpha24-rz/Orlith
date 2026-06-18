from models import Document, Workspace
from core.chroma import get_workspace_collection
from services.ai.gateway import LLMGateway
from sqlalchemy.ext.asyncio import AsyncSession
from langchain_text_splitters import RecursiveCharacterTextSplitter
from core.config import settings
from core.websocket import manager
import uuid
import os
import hashlib
import pdfplumber
import docx
import pytesseract
import pypdfium2 as pdfium
from PIL import Image
import logging

logger = logging.getLogger(__name__)


def get_file_hash(file_path: str) -> str:
    """Compute SHA-256 hash of a file."""
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(8192):
            hasher.update(chunk)
    return hasher.hexdigest()


def extract_text_from_file(
    file_path: str, file_type: str, ocr: bool = False
) -> tuple[list[dict], dict]:
    """
    Extracts text from various file formats.
    Returns: (list_of_pages, metadata_dict)
    where list_of_pages = [{"text": str, "page_number": int}]
    """
    file_path_lower = file_path.lower()
    metadata = {"ocr_applied": False, "page_count": 1}
    pages_data = []

    # TXT / MD Files
    if (
        file_path_lower.endswith(".txt")
        or file_path_lower.endswith(".md")
        or file_type in ("text/plain", "text/markdown")
    ):
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            text_content = f.read()
        pages_data.append({"text": text_content, "page_number": 1})
        metadata["page_count"] = 1

    # Word (DOCX) Files
    elif (
        file_path_lower.endswith(".docx")
        or file_type
        == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ):
        doc = docx.Document(file_path)
        text_parts = []
        for paragraph in doc.paragraphs:
            if paragraph.text:
                text_parts.append(paragraph.text)

        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    if cell.text:
                        text_parts.append(cell.text)

        text_content = "\n".join(text_parts)
        pages_data.append({"text": text_content, "page_number": 1})
        metadata["page_count"] = len(doc.paragraphs)

    # PDF Files
    elif file_path_lower.endswith(".pdf") or file_type == "application/pdf":
        page_count = 0
        total_text = ""
        try:
            with pdfplumber.open(file_path) as pdf:
                page_count = len(pdf.pages)
                for i, page in enumerate(pdf.pages):
                    page_text = page.extract_text()
                    if page_text:
                        pages_data.append({"text": page_text, "page_number": i + 1})
                        total_text += page_text
        except Exception as e:
            logger.warning(
                f"pdfplumber text extraction failed, falling back to OCR if available. Error: {e}"
            )

        metadata["page_count"] = page_count

        # Check if we should apply OCR
        if ocr or len(total_text.strip()) < 50:
            logger.info(
                "PDF has very little text or OCR was explicitly requested. Attempting OCR..."
            )
            import shutil

            if not shutil.which("tesseract"):
                raise RuntimeError(
                    "Tesseract OCR binary not found on the system. "
                    "Please install it (e.g. 'sudo apt-get install tesseract-ocr') to enable OCR processing."
                )

            try:
                pages_data.clear()  # clear whatever we got from pdfplumber
                pdf_doc = pdfium.PdfDocument(file_path)
                page_count = len(pdf_doc)
                metadata["page_count"] = page_count

                for i, page in enumerate(pdf_doc):
                    image = page.render(scale=2).to_pil()
                    page_text = pytesseract.image_to_string(image)
                    if page_text:
                        pages_data.append({"text": page_text, "page_number": i + 1})

                metadata["ocr_applied"] = True
            except Exception as e:
                raise RuntimeError(f"OCR processing failed: {str(e)}")

    else:
        raise ValueError(
            f"Unsupported file format: {file_type} or file extension for {file_path}"
        )

    return pages_data, metadata


async def broadcast_status(document: Document, db: AsyncSession, error_msg: str = None):
    """Broadcast status updates to the workspace's websocket connections and create global notifications."""
    payload = {
        "event": "document_status",
        "data": {
            "id": document.id,
            "workspace_id": document.workspace_id,
            "filename": document.filename,
            "status": document.status,
            "file_size": document.file_size,
            "created_at": document.created_at.isoformat()
            if document.created_at
            else None,
            "content_hash": document.content_hash,
            "metadata": document.metadata_json,
            "error": error_msg,
        },
    }
    await manager.broadcast_to_workspace(document.workspace_id, payload)

    # Global notifications for final states
    if document.status in ("ready", "error", "failed"):
        from models import Workspace, WorkspaceMember, Notification
        from sqlalchemy import select
        
        workspace = await db.get(Workspace, document.workspace_id)
        if not workspace:
            return

        result = await db.execute(select(WorkspaceMember.user_id).where(WorkspaceMember.workspace_id == workspace.id))
        user_ids = set(result.scalars().all())
        user_ids.add(workspace.owner_id)

        title = "Extraction Completed" if document.status == "ready" else "Extraction Failed"
        desc = f"{document.filename} is ready." if document.status == "ready" else f"{document.filename}: {error_msg or 'Failed'}"
        ntype = "success" if document.status == "ready" else "error"

        notifications = []
        for uid in user_ids:
            notif = Notification(
                user_id=uid,
                workspace_id=workspace.id,
                title=title,
                description=desc,
                type=ntype
            )
            db.add(notif)
            notifications.append(notif)
        
        await db.commit()

        # broadcast to global channels
        for notif in notifications:
            payload_global = {
                "event": "notification",
                "data": {
                    "id": notif.id,
                    "title": notif.title,
                    "description": notif.description,
                    "type": notif.type,
                    "workspace_id": notif.workspace_id,
                    "created_at": notif.created_at.isoformat() if notif.created_at else None,
                    "is_read": False
                }
            }
            await manager.broadcast_to_workspace(f"global_{notif.user_id}", payload_global)


async def embed_document(
    document: Document, chunks: list, embedding_provider, model_name: str, db: AsyncSession, provider_name: str
):
    """Embeds chunks and stores them into ChromaDB and PostgreSQL Chunk tables."""
    if not chunks:
        raise ValueError("No chunks to embed.")

    from models.chunk import Chunk, ChunkEmbedding
    from sqlalchemy import delete

    # 1. Clean existing PostgreSQL chunks for this document
    await db.execute(delete(Chunk).where(Chunk.document_id == document.id))
    # ChunkEmbedding cascades on delete, so no need to delete them explicitly
    await db.commit()

    collection = get_workspace_collection(document.workspace_id)
    # Check if there are existing embeddings for this document (e.g., in a re-embed scenario)
    try:
        collection.delete(where={"document_id": document.id})
    except Exception:
        pass  # Ignore if not found

    texts_to_embed = [c["text"] for c in chunks]
    embeddings = await embedding_provider.embed(texts_to_embed, model_name)

    # Prepare for Chroma
    ids = [f"{document.id}_{c['chunk_index']}" for c in chunks]
    metadatas = [
        {
            "document_id": document.id,
            "filename": document.filename,
            "page_number": c["page_number"],
            "chunk_index": c["chunk_index"],
        }
        for c in chunks
    ]
    collection.add(
        ids=ids, embeddings=embeddings, metadatas=metadatas, documents=texts_to_embed
    )

    # 2. Store in PostgreSQL
    db_chunks = []
    for i, c in enumerate(chunks):
        chunk_obj = Chunk(
            document_id=document.id,
            content=c["text"],
            page_number=c["page_number"],
            section=c.get("section"),
            chunk_index=c["chunk_index"],
            token_count=c.get("token_count", 0)
        )
        db.add(chunk_obj)
        db_chunks.append((chunk_obj, embeddings[i]))
        
    await db.commit() # Commit to get chunk IDs
    
    for chunk_obj, emb in db_chunks:
        emb_obj = ChunkEmbedding(
            chunk_id=chunk_obj.id,
            provider=provider_name,
            model=model_name,
            dimension=len(emb),
            embedding=emb
        )
        db.add(emb_obj)
        
    await db.commit()


async def process_document(document_id: str, db: AsyncSession, ocr: bool = False):
    """Background task to extract, chunk, embed, and store a document."""
    document = await db.get(Document, document_id)
    if not document:
        logger.error(f"Ingestion failed: Document {document_id} not found in database.")
        return

    document.status = "processing"
    await db.commit()
    await db.refresh(document)
    await broadcast_status(document, db)

    try:
        workspace = await db.get(Workspace, document.workspace_id)
        if not workspace:
            raise ValueError(f"Workspace {document.workspace_id} not found.")

        from services.ai.gateway import LLMGateway
        gateway = LLMGateway(db)
        embedding_provider, model_name = await gateway.get_embedding_provider(workspace)
        provider_name = "openrouter"

        # Update content hash
        if not document.content_hash:
            document.content_hash = get_file_hash(document.file_path)

        # Extract text (now per page)
        pages_data, meta = extract_text_from_file(
            document.file_path, document.file_type, ocr=ocr
        )

        # Setup structural splitter
        is_markdown = (
            document.file_type == "text/markdown"
            or document.file_path.lower().endswith((".md", ".markdown"))
        )
        from services.chunking import StructuralTextSplitter
        splitter = StructuralTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP,
            is_markdown=is_markdown,
        )

        chunks = splitter.split_pages(pages_data)
        
        total_chars = sum(len(c["text"]) for c in chunks)

        if not chunks:
            raise ValueError("No text content could be extracted from the file.")

        # Embed and store to Chroma + Postgres
        await embed_document(document, chunks, embedding_provider, model_name, db, provider_name)

        # Complete status update
        document.status = "ready"
        meta["chunk_count"] = len(chunks)
        meta["char_count"] = total_chars
        document.metadata_json = meta

        await db.commit()
        await db.refresh(document)
        await broadcast_status(document, db)

    except Exception as e:
        logger.exception(f"Error during document ingestion: {e}")
        # Set status to error/failed
        document.status = "error"
        error_msg = str(e)
        document.error_message = error_msg
        
        if document.metadata_json is None:
            document.metadata_json = {}
        document.metadata_json = {**document.metadata_json, "error": error_msg}

        await db.commit()
        await db.refresh(document)
        await broadcast_status(document, db, error_msg=error_msg)
