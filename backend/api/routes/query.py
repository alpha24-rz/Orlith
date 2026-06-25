from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Optional
from core.database import get_db
from models.user import User
from api.deps import get_current_user, get_workspace_member
from services.ai import AIOrchestrator
from services.ai.retrieval.search import semantic_search_docs

router = APIRouter(prefix="/query", tags=["Query"])


class QueryRequest(BaseModel):
    workspace_id: str
    message: str
    conversation_id: Optional[str] = None
    conversation_history: Optional[List[Dict[str, str]]] = []
    # Context compaction: batas token sebelum kompresi (default: 4000)
    max_context_tokens: Optional[int] = 4000
    # Query rewriting: perluas query sebelum embedding search (default: True)
    enable_rewriting: Optional[bool] = True
    endpoint_id: Optional[str] = None
    model: Optional[str] = None


class SearchRequest(BaseModel):
    workspace_id: str
    query: str
    top_k: Optional[int] = 10


@router.post("")
async def query_workspace(
    request: QueryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await get_workspace_member(request.workspace_id, current_user, db)
    orchestrator = AIOrchestrator(db)
    return StreamingResponse(
        orchestrator.route_query(
            workspace_id=request.workspace_id,
            user_id=current_user.id,
            query=request.message,
            mode="chat",
            conversation_id=request.conversation_id,
            conversation_history=request.conversation_history,
            max_context_tokens=request.max_context_tokens,
            enable_rewriting=request.enable_rewriting,
            override_endpoint_id=request.endpoint_id,
            override_model=request.model,
        ),
        media_type="text/event-stream",
    )


@router.post("/search")
async def semantic_search(
    request: SearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Perform semantic (vector) search across all documents in a workspace.
    Returns ranked document chunks with relevance scores and metadata.
    """
    await get_workspace_member(request.workspace_id, current_user, db)
    results = await semantic_search_docs(
        request.workspace_id, request.query, request.top_k, db
    )
    return {"results": results}

