from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional


class WorkspaceBase(BaseModel):
    name: str
    description: Optional[str] = None


class WorkspaceCreate(WorkspaceBase):
    pass


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class WorkspaceAISettingsUpdate(BaseModel):
    active_llm_provider: Optional[str] = None
    active_llm_model: Optional[str] = None
    active_embedding_provider: Optional[str] = None
    active_embedding_model: Optional[str] = None


class WorkspaceResponse(WorkspaceBase):
    id: str
    owner_id: str
    created_at: datetime
    active_llm_provider: Optional[str] = None
    active_llm_model: Optional[str] = None
    active_embedding_provider: Optional[str] = None
    active_embedding_model: Optional[str] = None
    doc_count: int = 0
    member_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class WorkspaceMemberInvite(BaseModel):
    email: str


class WorkspaceMemberRoleUpdate(BaseModel):
    role: str
