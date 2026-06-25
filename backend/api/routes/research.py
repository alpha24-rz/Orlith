from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
import json

from core.database import get_db
from models import ResearchJob
from models.user import User
from api.deps import get_current_user, get_workspace_member
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
    current_user: User = Depends(get_current_user),
):
    """
    Mulai sesi Deep Research baru.
    """
    await get_workspace_member(request.workspace_id, current_user, db)
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
            user_id=current_user.id,
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
    current_user: User = Depends(get_current_user),
):
    """
    Ambil daftar semua research jobs milik workspace.
    """
    await get_workspace_member(workspace_id, current_user, db)
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
    current_user: User = Depends(get_current_user),
):
    """
    Ambil detail lengkap satu research job, termasuk laporan Markdown.
    """
    await get_workspace_member(workspace_id, current_user, db)
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
    current_user: User = Depends(get_current_user),
):
    """Hapus satu research job beserta laporannya."""
    await get_workspace_member(workspace_id, current_user, db)
    job = await db.get(ResearchJob, job_id)
    if not job or job.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Research job tidak ditemukan.")

    await db.delete(job)
    await db.commit()
    return {"success": True, "deleted_id": job_id}

