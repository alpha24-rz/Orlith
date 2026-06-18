"""
Research Routes — DocuMind AI
================================
Endpoints untuk menjalankan Deep Research dan mengakses hasil laporan.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
import json

from core.database import get_db
from models import ResearchJob
from services.ai import AIOrchestrator

router = APIRouter(prefix="/research", tags=["Deep Research"])


class StartResearchRequest(BaseModel):
    workspace_id: str
    query: str
    provider: Optional[str] = None
    model: Optional[str] = None


class ResearchJobResponse(BaseModel):
    id: str
    workspace_id: str
    query: str
    status: str
    created_at: str
    completed_at: Optional[str] = None

    class Config:
        from_attributes = True


@router.post("/start")
async def start_research(
    request: StartResearchRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Mulai sesi Deep Research baru.

    Membuat ResearchJob di database, lalu langsung memulai pipeline
    dan streaming progress via SSE.

    SSE Events:
      - {event: "plan_start"}
      - {event: "plan", sub_questions: [...], count: N}
      - {event: "searching", question: "...", index: N, total: M}
      - {event: "found", question: "...", chunks_found: K}
      - {event: "synthesizing", question: "...", index: N}
      - {event: "synthesized", question: "...", summary_length: N}
      - {event: "iterating", reason: "...", weak_questions: [...]}
      - {event: "writing_report", total_chunks: N}
      - {event: "done", job_id: "...", report_length: N}
      - {event: "error", message: "..."}
    """
    # Buat ResearchJob dulu
    job = ResearchJob(
        workspace_id=request.workspace_id,
        query=request.query,
        status="pending",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    job_id = job.id

    orchestrator = AIOrchestrator(db)
    return StreamingResponse(
        orchestrator.route_query(
            workspace_id=request.workspace_id,
            user_id=None,
            query=request.query,
            mode="research",
            conversation_history=[],
            override_endpoint_id=request.provider,
            override_model=request.model,
            job_id=job_id,
        ),
        media_type="text/event-stream",
        headers={
            "X-Research-Job-Id": job_id,
            "Cache-Control": "no-cache",
        },
    )


@router.get("/{workspace_id}/jobs")
async def list_research_jobs(
    workspace_id: str,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    """
    Ambil daftar semua research jobs milik workspace.
    Untuk Research Job Queue UI.
    """
    result = await db.execute(
        select(ResearchJob)
        .where(ResearchJob.workspace_id == workspace_id)
        .order_by(ResearchJob.created_at.desc())
        .limit(limit)
    )
    jobs = result.scalars().all()

    return {
        "jobs": [
            {
                "id": j.id,
                "workspace_id": j.workspace_id,
                "query": j.query,
                "status": j.status,
                "sub_questions_count": (
                    len(json.loads(j.sub_questions)) if j.sub_questions else 0
                ),
                "total_chunks": j.total_chunks_found,
                "report_length": len(j.result_markdown) if j.result_markdown else 0,
                "created_at": j.created_at.isoformat() if j.created_at else None,
                "completed_at": j.completed_at.isoformat() if j.completed_at else None,
            }
            for j in jobs
        ]
    }


@router.get("/{workspace_id}/jobs/{job_id}")
async def get_research_job(
    workspace_id: str,
    job_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Ambil detail lengkap satu research job, termasuk laporan Markdown.
    """
    job = await db.get(ResearchJob, job_id)
    if not job or job.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Research job tidak ditemukan.")

    sub_questions = []
    if job.sub_questions:
        try:
            sub_questions = json.loads(job.sub_questions)
        except Exception:
            pass

    progress_log = []
    if job.progress_log:
        try:
            progress_log = json.loads(job.progress_log)
        except Exception:
            pass

    return {
        "id": job.id,
        "workspace_id": job.workspace_id,
        "query": job.query,
        "status": job.status,
        "sub_questions": sub_questions,
        "result_markdown": job.result_markdown,
        "total_chunks_found": job.total_chunks_found,
        "error_message": job.error_message,
        "progress_log": progress_log,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }


@router.delete("/{workspace_id}/jobs/{job_id}")
async def delete_research_job(
    workspace_id: str,
    job_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Hapus satu research job beserta laporannya."""
    job = await db.get(ResearchJob, job_id)
    if not job or job.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Research job tidak ditemukan.")

    await db.delete(job)
    await db.commit()
    return {"success": True, "deleted_id": job_id}
