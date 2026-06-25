from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Dict, Optional
import json

from core.database import get_db
from models import AgentTrace
from models.user import User
from api.deps import get_current_user, get_workspace_member
from services.ai import AIOrchestrator

router = APIRouter(prefix="/agent", tags=["Agent"])


class AgentRunRequest(BaseModel):
    workspace_id: str
    message: str
    conversation_id: Optional[str] = None
    conversation_history: Optional[List[Dict[str, str]]] = []
    # Maksimum tool call iterations sebelum berhenti
    max_iterations: Optional[int] = 8
    provider: Optional[str] = None
    model: Optional[str] = None


class AgentTraceResponse(BaseModel):
    id: str
    workspace_id: str
    user_query: str
    total_iterations: int
    status: str
    created_at: str
    completed_at: Optional[str] = None

    class Config:
        from_attributes = True


@router.post("/run")
async def run_agent_endpoint(
    request: AgentRunRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Jalankan agent loop dengan tool calling.
    """
    await get_workspace_member(request.workspace_id, current_user, db)
    orchestrator = AIOrchestrator(db)
    return StreamingResponse(
        orchestrator.route_query(
            workspace_id=request.workspace_id,
            user_id=current_user.id,
            query=request.message,
            mode="agent",
            conversation_id=request.conversation_id,
            conversation_history=request.conversation_history or [],
            override_endpoint_id=request.provider,
            override_model=request.model,
            max_iterations=min(request.max_iterations or 8, 12),
        ),
        media_type="text/event-stream",
    )


@router.get("/{workspace_id}/traces")
async def list_agent_traces(
    workspace_id: str,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Ambil riwayat agent runs untuk workspace tertentu.
    Untuk observability dan debugging.
    """
    await get_workspace_member(workspace_id, current_user, db)
    result = await db.execute(
        select(AgentTrace)
        .where(AgentTrace.workspace_id == workspace_id)
        .order_by(AgentTrace.created_at.desc())
        .limit(limit)
    )
    traces = result.scalars().all()

    return {
        "traces": [
            {
                "id": t.id,
                "workspace_id": t.workspace_id,
                "user_query": t.user_query,
                "total_iterations": t.total_iterations,
                "status": t.status,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            }
            for t in traces
        ]
    }


@router.get("/{workspace_id}/traces/{trace_id}")
async def get_agent_trace(
    workspace_id: str,
    trace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Ambil detail lengkap satu agent trace termasuk semua steps.
    """
    await get_workspace_member(workspace_id, current_user, db)
    trace = await db.get(AgentTrace, trace_id)
    if not trace or trace.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Trace tidak ditemukan.")

    steps = []
    if trace.steps:
        try:
            steps = json.loads(trace.steps)
        except json.JSONDecodeError:
            steps = []

    return {
        "id": trace.id,
        "workspace_id": trace.workspace_id,
        "user_query": trace.user_query,
        "final_answer": trace.final_answer,
        "total_iterations": trace.total_iterations,
        "status": trace.status,
        "steps": steps,
        "created_at": trace.created_at.isoformat() if trace.created_at else None,
        "completed_at": trace.completed_at.isoformat() if trace.completed_at else None,
    }

