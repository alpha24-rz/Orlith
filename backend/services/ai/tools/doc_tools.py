import logging
from typing import Dict, Any, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models import Workspace, Document
from core.chroma import get_workspace_collection
from services.ai.providers.base import IEmbeddingProvider
from services.ai.tools.registry import ToolRegistry

logger = logging.getLogger(__name__)

# Definitions
SEARCH_DOCUMENTS_DEFINITION = {
    "type": "function",
    "function": {
        "name": "search_documents",
        "description": (
            "Lakukan semantic search di seluruh dokumen dalam workspace. "
            "Gunakan ini untuk mencari informasi spesifik berdasarkan topik atau kata kunci. "
            "Kembalikan chunk teks yang paling relevan."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Query pencarian dalam bahasa natural atau kata kunci."
                },
                "top_k": {
                    "type": "integer",
                    "description": "Jumlah hasil teratas yang dikembalikan (default: 5, max: 10).",
                    "default": 5
                }
            },
            "required": ["query"]
        }
    }
}

LIST_DOCUMENTS_DEFINITION = {
    "type": "function",
    "function": {
        "name": "list_documents",
        "description": (
            "Tampilkan daftar semua dokumen yang tersedia di workspace. "
            "Gunakan ini untuk mengetahui dokumen apa saja yang ada sebelum mencari."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    }
}

GET_DOCUMENT_METADATA_DEFINITION = {
    "type": "function",
    "function": {
        "name": "get_document_metadata",
        "description": (
            "Ambil metadata lengkap dari satu dokumen berdasarkan ID-nya. "
            "Termasuk nama file, jumlah halaman, ukuran, tanggal upload."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "doc_id": {
                    "type": "string",
                    "description": "ID unik dokumen yang ingin diambil metadatanya."
                }
            },
            "required": ["doc_id"]
        }
    }
}

GET_DOCUMENT_CONTENT_DEFINITION = {
    "type": "function",
    "function": {
        "name": "get_document_content",
        "description": (
            "Ambil konten teks dari halaman tertentu sebuah dokumen. "
            "Gunakan jika perlu membaca isi dokumen secara spesifik di halaman tertentu."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "doc_id": {
                    "type": "string",
                    "description": "ID unik dokumen."
                },
                "page": {
                    "type": "integer",
                    "description": "Nomor halaman yang ingin dibaca (dimulai dari 1).",
                    "default": 1
                }
            },
            "required": ["doc_id"]
        }
    }
}

SEMANTIC_SEARCH_DEFINITION = {
    "type": "function",
    "function": {
        "name": "semantic_search",
        "description": (
            "Lakukan semantic search dengan filter tambahan. "
            "Gunakan jika ingin membatasi pencarian berdasarkan tipe dokumen atau rentang tanggal upload."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Query pencarian."
                },
                "top_k": {
                    "type": "integer",
                    "description": "Jumlah hasil (default: 5).",
                    "default": 5
                },
                "doc_type": {
                    "type": "string",
                    "description": "Filter tipe dokumen: 'PDF', 'DOCX', 'XLSX', 'TXT', dsb. Opsional.",
                    "enum": ["PDF", "DOCX", "XLSX", "TXT", "MD", "CSV"]
                }
            },
            "required": ["query"]
        }
    }
}

# Implementations
async def search_documents(
    query: str,
    top_k: int = 5,
    *,
    db: AsyncSession,
    workspace: Workspace,
    embedding_provider: IEmbeddingProvider,
    embed_model: str,
) -> Dict[str, Any]:
    if not query.strip():
        return {"hits": [], "message": "Query kosong."}

    try:
        embeddings = await embedding_provider.embed([query], embed_model)
        query_embedding = embeddings[0]
    except Exception as e:
        return {"error": f"Gagal membuat embedding: {e}"}

    collection = get_workspace_collection(workspace.id)
    try:
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
        )
    except Exception as e:
        return {"error": f"ChromaDB error: {e}"}

    hits = []
    if results and results.get("documents") and results["documents"]:
        docs = results["documents"][0]
        distances = results.get("distances", [[1.0] * len(docs)])[0]
        metadatas = results.get("metadatas", [[{}] * len(docs)])[0]

        for text, distance, meta in zip(docs, distances, metadatas):
            similarity = round(max(0.0, min(1.0, 1.0 - distance)), 3)
            hits.append({
                "doc_id": meta.get("document_id", ""),
                "filename": meta.get("filename", "Unknown"),
                "page": meta.get("page_number", 1),
                "relevance": similarity,
                "text": text,
                "excerpt": text[:400] + "..." if len(text) > 400 else text
            })

    return {
        "query": query,
        "hits_found": len(hits),
        "hits": hits
    }

async def list_documents(
    *,
    db: AsyncSession,
    workspace: Workspace,
    **kwargs,
) -> Dict[str, Any]:
    result = await db.execute(
        select(Document).where(Document.workspace_id == workspace.id)
    )
    docs = result.scalars().all()

    doc_list = []
    for doc in docs:
        doc_list.append({
            "doc_id": doc.id,
            "filename": doc.filename,
            "file_size_bytes": doc.file_size,
            "status": doc.status,
            "uploaded_at": doc.created_at.isoformat() if doc.created_at else None,
            "page_count": (doc.metadata or {}).get("page_count") if hasattr(doc, 'metadata') and doc.metadata else None,
            "chunk_count": (doc.metadata or {}).get("chunk_count") if hasattr(doc, 'metadata') and doc.metadata else None,
        })

    return {
        "total_documents": len(doc_list),
        "documents": doc_list
    }

async def get_document_metadata(
    doc_id: str,
    *,
    db: AsyncSession,
    workspace: Workspace,
    **kwargs,
) -> Dict[str, Any]:
    if not doc_id:
        return {"error": "doc_id diperlukan."}

    doc = await db.get(Document, doc_id)
    if not doc or doc.workspace_id != workspace.id:
        return {"error": f"Dokumen '{doc_id}' tidak ditemukan di workspace ini."}

    return {
        "doc_id": doc.id,
        "filename": doc.filename,
        "file_size_bytes": doc.file_size,
        "status": doc.status,
        "uploaded_at": doc.created_at.isoformat() if doc.created_at else None,
        "metadata": doc.metadata if hasattr(doc, 'metadata') and doc.metadata else {}
    }

async def get_document_content(
    doc_id: str,
    page: int = 1,
    *,
    db: AsyncSession,
    workspace: Workspace,
    **kwargs,
) -> Dict[str, Any]:
    if not doc_id:
        return {"error": "doc_id diperlukan."}

    doc = await db.get(Document, doc_id)
    if not doc or doc.workspace_id != workspace.id:
        return {"error": f"Dokumen '{doc_id}' tidak ditemukan."}

    collection = get_workspace_collection(workspace.id)
    try:
        results = collection.get(
            where={
                "$and": [
                    {"document_id": {"$eq": doc_id}},
                    {"page_number": {"$eq": page}}
                ]
            },
            limit=5,
        )
    except Exception:
        # Fallback if $and query is not supported
        try:
            results = collection.get(
                where={"document_id": {"$eq": doc_id}},
                limit=10,
            )
        except Exception as e:
            return {"error": f"Gagal mengambil konten: {e}"}

    if not results or not results.get("documents"):
        return {
            "doc_id": doc_id,
            "filename": doc.filename,
            "page": page,
            "content": "Konten halaman ini tidak ditemukan di index."
        }

    docs = results["documents"]
    metadatas = results.get("metadatas", [{}] * len(docs))

    page_chunks = []
    all_chunks = []
    for text, meta in zip(docs, metadatas):
        all_chunks.append(text)
        if meta.get("page_number") == page:
            page_chunks.append(text)

    content = "\n\n".join(page_chunks) if page_chunks else "\n\n".join(all_chunks[:3])

    return {
        "doc_id": doc_id,
        "filename": doc.filename,
        "page": page,
        "content": content[:2000] + "..." if len(content) > 2000 else content
    }

async def semantic_search(
    query: str,
    top_k: int = 5,
    doc_type: Optional[str] = None,
    *,
    db: AsyncSession,
    workspace: Workspace,
    embedding_provider: IEmbeddingProvider,
    embed_model: str,
) -> Dict[str, Any]:
    base_result = await search_documents(
        query=query,
        top_k=top_k * 2,
        db=db,
        workspace=workspace,
        embedding_provider=embedding_provider,
        embed_model=embed_model,
    )

    if "error" in base_result:
        return base_result

    hits = base_result.get("hits", [])

    if doc_type:
        filtered_hits = []
        for hit in hits:
            filename = hit.get("filename", "")
            ext = filename.rsplit(".", 1)[-1].upper() if "." in filename else ""
            if ext == doc_type.upper():
                filtered_hits.append(hit)
        hits = filtered_hits

    return {
        "query": query,
        "doc_type_filter": doc_type,
        "hits_found": len(hits[:top_k]),
        "hits": hits[:top_k]
    }

def get_default_registry() -> ToolRegistry:
    registry = ToolRegistry()
    registry.register(SEARCH_DOCUMENTS_DEFINITION, search_documents)
    registry.register(LIST_DOCUMENTS_DEFINITION, list_documents)
    registry.register(GET_DOCUMENT_METADATA_DEFINITION, get_document_metadata)
    registry.register(GET_DOCUMENT_CONTENT_DEFINITION, get_document_content)
    registry.register(SEMANTIC_SEARCH_DEFINITION, semantic_search)
    return registry
