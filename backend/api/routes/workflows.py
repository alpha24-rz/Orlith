from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List
from models import Workflow, Workspace
from models.user import User
from schemas.workflow import WorkflowCreate, WorkflowUpdate, WorkflowResponse
from core.database import get_db
from api.deps import get_current_user, get_workspace_member

router = APIRouter(prefix="/workflows", tags=["workflows"])

@router.get("", response_model=List[WorkflowResponse])
async def get_workflows(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await get_workspace_member(workspace_id, current_user, db)
    result = await db.execute(select(Workflow).filter(Workflow.workspace_id == workspace_id).order_by(desc(Workflow.updated_at)))
    workflows = result.scalars().all()
    return workflows

@router.post("", response_model=WorkflowResponse)
async def create_workflow(
    workflow_in: WorkflowCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await get_workspace_member(workflow_in.workspace_id, current_user, db)
    workflow = Workflow(
        workspace_id=workflow_in.workspace_id,
        name=workflow_in.name,
        description=workflow_in.description,
        workflow_type=workflow_in.workflow_type,
        is_active=workflow_in.is_active,
        version=workflow_in.version,
        nodes=workflow_in.nodes,
        edges=workflow_in.edges,
        viewport=workflow_in.viewport
    )
    db.add(workflow)
    await db.commit()
    await db.refresh(workflow)
    return workflow

@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Workflow).filter(Workflow.id == workflow_id))
    workflow = result.scalars().first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
        
    await get_workspace_member(workflow.workspace_id, current_user, db)
    return workflow

@router.put("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: str,
    workflow_in: WorkflowUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Workflow).filter(Workflow.id == workflow_id))
    workflow = result.scalars().first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
        
    await get_workspace_member(workflow.workspace_id, current_user, db)
    
    update_data = workflow_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(workflow, field, value)
        
    await db.commit()
    await db.refresh(workflow)
    return workflow

@router.delete("/{workflow_id}")
async def delete_workflow(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Workflow).filter(Workflow.id == workflow_id))
    workflow = result.scalars().first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
        
    await get_workspace_member(workflow.workspace_id, current_user, db)
    await db.delete(workflow)
    await db.commit()
    return {"message": "Workflow deleted successfully"}

