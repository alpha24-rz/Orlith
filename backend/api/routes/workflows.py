from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List
from models import Workflow, Workspace
from schemas.workflow import WorkflowCreate, WorkflowUpdate, WorkflowResponse
from core.database import get_db

router = APIRouter(prefix="/workflows", tags=["workflows"])

@router.get("", response_model=List[WorkflowResponse])
async def get_workflows(workspace_id: str, db: AsyncSession = Depends(get_db)):
    # Verify workspace exists
    ws_result = await db.execute(select(Workspace).filter(Workspace.id == workspace_id))
    workspace = ws_result.scalars().first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
        
    result = await db.execute(select(Workflow).filter(Workflow.workspace_id == workspace_id).order_by(desc(Workflow.updated_at)))
    workflows = result.scalars().all()
    return workflows

@router.post("", response_model=WorkflowResponse)
async def create_workflow(workflow_in: WorkflowCreate, db: AsyncSession = Depends(get_db)):
    ws_result = await db.execute(select(Workspace).filter(Workspace.id == workflow_in.workspace_id))
    workspace = ws_result.scalars().first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
        
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
async def get_workflow(workflow_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Workflow).filter(Workflow.id == workflow_id))
    workflow = result.scalars().first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow

@router.put("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(workflow_id: str, workflow_in: WorkflowUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Workflow).filter(Workflow.id == workflow_id))
    workflow = result.scalars().first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
        
    update_data = workflow_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(workflow, field, value)
        
    await db.commit()
    await db.refresh(workflow)
    return workflow

@router.delete("/{workflow_id}")
async def delete_workflow(workflow_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Workflow).filter(Workflow.id == workflow_id))
    workflow = result.scalars().first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
        
    await db.delete(workflow)
    await db.commit()
    return {"message": "Workflow deleted successfully"}
