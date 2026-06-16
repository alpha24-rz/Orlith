"""
Extraction service — runs structured data extraction over indexed document chunks
using the workspace's configured LLM provider.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List

from sqlalchemy.ext.asyncio import AsyncSession

from core.chroma import get_workspace_collection
from models import Document, Workspace
from models.extraction import ExtractionJob
from services.ai.gateway import LLMGateway


async def extract_data(
    document_id: str,
    fields: List[Dict[str, str]],
    db: AsyncSession,
) -> Dict[str, Any]:
    """Extract structured fields from a single indexed document.

    Args:
        document_id: The document's UUID.
        fields: List of {"name": str, "type": str} dicts defining the schema.
        db: Async SQLAlchemy session.

    Returns:
        Dict mapping field names to extracted values (or None when not found).
    """
    document = await db.get(Document, document_id)
    if not document:
        raise ValueError(f"Document not found: {document_id}")

    workspace = await db.get(Workspace, document.workspace_id)
    if not workspace:
        raise ValueError(f"Workspace not found: {document.workspace_id}")

    gateway = LLMGateway(db)
    chat_provider, chat_model = await gateway.get_chat_provider(workspace)

    # Pull the indexed text chunks for this document from ChromaDB
    collection = get_workspace_collection(workspace.id)
    results = collection.get(where={"document_id": document.id})

    if not results or not results.get("documents"):
        raise ValueError(f"No indexed text found for document {document_id}")

    # Use up to 10 chunks to stay within context limits
    chunks = results["documents"][:10]
    text = "\n\n---\n\n".join(chunks)

    # Build a clean JSON schema description for the prompt
    schema_lines = "\n".join(f'  "{f["name"]}": <{f["type"]}>' for f in fields)
    schema_json = "{\n" + schema_lines + "\n}"

    system_prompt = (
        "You are an expert data extraction system. "
        "Extract the requested fields from the provided document text. "
        "Return ONLY a valid JSON object — no markdown fences, no explanations. "
        "Use null for any field that cannot be found in the text.\n\n"
        f"Required JSON schema:\n{schema_json}"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Document text:\n\n{text}"},
    ]

    try:
        raw = await chat_provider.generate_response(
            messages=messages,
            model=chat_model,
            temperature=0.0,
        )
        extracted = json.loads(raw)
    except (json.JSONDecodeError, Exception) as exc:
        # Graceful fallback — mark all fields as null
        extracted = {f["name"]: None for f in fields}
        extracted["_extraction_error"] = str(exc)

    return extracted


async def run_extraction_job(job_id: str, db: AsyncSession) -> None:
    """Background task: process every document in an extraction job.

    Updates job.status, job.processed_count, and job.results progressively.
    """
    job = await db.get(ExtractionJob, job_id)
    if not job:
        return

    job.status = "running"
    await db.commit()

    results: Dict[str, Any] = {}
    errors: Dict[str, str] = {}

    for doc_id in job.document_ids:
        try:
            extracted = await extract_data(doc_id, job.fields, db)
            results[doc_id] = extracted
        except Exception as exc:
            errors[doc_id] = str(exc)
            results[doc_id] = {f["name"]: None for f in job.fields}

        # Persist incremental progress
        job = await db.get(ExtractionJob, job_id)
        if job is None:
            return  # Job was deleted while running
        job.processed_count = (job.processed_count or 0) + 1
        job.results = results
        await db.commit()

    # Finalise
    job = await db.get(ExtractionJob, job_id)
    if job is None:
        return
    job.status = "failed" if len(errors) == len(job.document_ids) else "completed"
    job.results = results
    job.completed_at = datetime.now(timezone.utc)
    await db.commit()
