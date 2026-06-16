"""
REST API routes for the structured data extraction feature.

Endpoints:
  POST   /extract                      — Create & queue an extraction job
  GET    /extract                      — List all jobs for a workspace
  GET    /extract/{job_id}             — Get job status + results
  DELETE /extract/{job_id}             — Delete a job and its results
  GET    /extract/{job_id}/export      — Export results as CSV or JSON
"""

from __future__ import annotations

import csv
import io
import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from core.database import get_db
from models import Document, User
from models.extraction import ExtractionJob
from services.extraction import run_extraction_job

router = APIRouter(prefix="/extract", tags=["Extraction"])


# ─── Schemas ──────────────────────────────────────────────────────────────────


class ExtractionField(BaseModel):
    name: str
    type: str  # string | number | date | boolean | array


class CreateJobRequest(BaseModel):
    workspace_id: str
    name: str
    fields: List[ExtractionField]
    document_ids: List[str]


class JobResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    fields: List[Dict[str, str]]
    document_ids: List[str]
    status: str
    processed_count: int
    doc_count: int
    results: Optional[Dict[str, Any]]
    error_message: Optional[str]
    created_at: str
    completed_at: Optional[str]

    @classmethod
    def from_orm(cls, job: ExtractionJob) -> "JobResponse":
        return cls(
            id=job.id,
            workspace_id=job.workspace_id,
            name=job.name,
            fields=job.fields or [],
            document_ids=job.document_ids or [],
            status=job.status,
            processed_count=job.processed_count or 0,
            doc_count=job.doc_count or 0,
            results=job.results,
            error_message=job.error_message,
            created_at=job.created_at.isoformat(),
            completed_at=job.completed_at.isoformat() if job.completed_at else None,
        )


# ─── Routes ───────────────────────────────────────────────────────────────────


@router.post("", response_model=JobResponse)
async def create_extraction_job(
    payload: CreateJobRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create and immediately queue an extraction job."""
    # Validate that every document belongs to the workspace
    doc_ids = payload.document_ids
    result = await db.execute(
        select(Document).where(
            Document.id.in_(doc_ids),
            Document.workspace_id == payload.workspace_id,
            Document.status == "ready",
        )
    )
    valid_docs = result.scalars().all()
    valid_ids = [d.id for d in valid_docs]

    if not valid_ids:
        raise HTTPException(
            status_code=422,
            detail="No ready documents found in this workspace matching the provided IDs.",
        )

    job = ExtractionJob(
        workspace_id=payload.workspace_id,
        name=payload.name,
        fields=[f.model_dump() for f in payload.fields],
        document_ids=valid_ids,
        doc_count=len(valid_ids),
        status="queued",
        processed_count=0,
        results=None,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Run in background
    background_tasks.add_task(run_extraction_job, job.id, db)

    return JobResponse.from_orm(job)


@router.get("", response_model=List[JobResponse])
async def list_extraction_jobs(
    workspace_id: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all extraction jobs for a workspace, newest first."""
    result = await db.execute(
        select(ExtractionJob)
        .where(ExtractionJob.workspace_id == workspace_id)
        .order_by(ExtractionJob.created_at.desc())
    )
    jobs = result.scalars().all()
    return [JobResponse.from_orm(j) for j in jobs]


@router.get("/{job_id}", response_model=JobResponse)
async def get_extraction_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current status and results for a single extraction job."""
    job = await db.get(ExtractionJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Extraction job not found")
    return JobResponse.from_orm(job)


@router.delete("/{job_id}", status_code=204)
async def delete_extraction_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an extraction job and all its results."""
    job = await db.get(ExtractionJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Extraction job not found")
    await db.delete(job)
    await db.commit()
    return None


@router.get("/{job_id}/export")
async def export_extraction_results(
    job_id: str,
    format: str = Query("csv", pattern="^(csv|json)$"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export the extraction results as CSV or JSON."""
    job = await db.get(ExtractionJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Extraction job not found")
    if job.status != "completed":
        raise HTTPException(status_code=409, detail="Job is not completed yet")

    results: Dict[str, Any] = job.results or {}
    field_names = [f["name"] for f in (job.fields or [])]

    # Fetch document filenames for nicer output
    doc_ids = list(results.keys())
    doc_map: Dict[str, str] = {}
    if doc_ids:
        dr = await db.execute(select(Document).where(Document.id.in_(doc_ids)))
        for d in dr.scalars().all():
            doc_map[d.id] = d.filename

    if format == "json":
        # Include document filenames
        export_data = []
        for doc_id, extracted in results.items():
            row = {"_document": doc_map.get(doc_id, doc_id)}
            row.update(extracted)
            export_data.append(row)

        content = json.dumps(export_data, indent=2, ensure_ascii=False)
        return Response(
            content=content,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{job.name}.json"'},
        )

    # CSV
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["Document"] + field_names,
        extrasaction="ignore",
    )
    writer.writeheader()
    for doc_id, extracted in results.items():
        row = {"Document": doc_map.get(doc_id, doc_id)}
        for fn in field_names:
            val = extracted.get(fn)
            row[fn] = "" if val is None else str(val)
        writer.writerow(row)

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{job.name}.csv"'},
    )
