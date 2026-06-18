from sqlalchemy import Column, String, Boolean, Integer, DateTime, ForeignKey, Text, JSON
from datetime import datetime, timezone
import uuid
from core.database import Base

class Workflow(Base):
    __tablename__ = "workflows"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String, ForeignKey("workspaces.id"), nullable=False)
    name = Column(String, nullable=False, default="Untitled Workflow")
    description = Column(Text, nullable=True)
    workflow_type = Column(String, nullable=True, default="agent") # chat, document_analysis, rag, agent, automation
    is_active = Column(Boolean, default=True)
    version = Column(Integer, default=1)
    
    # Graph structure
    nodes = Column(JSON, default=list)
    edges = Column(JSON, default=list)
    viewport = Column(JSON, default=dict)
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class WorkflowRun(Base):
    __tablename__ = "workflow_runs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workflow_id = Column(String, ForeignKey("workflows.id"), nullable=False)
    status = Column(String, default="pending") # pending, running, completed, failed
    
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)
