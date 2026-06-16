from sqlalchemy import Column, String, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from core.database import Base
import uuid
from datetime import datetime, timezone


class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    owner_id = Column(String, ForeignKey("users.id"), nullable=False)
    owner = relationship("User", back_populates="workspaces")

    documents = relationship(
        "Document", back_populates="workspace", cascade="all, delete-orphan"
    )
    credentials = relationship(
        "WorkspaceCredential", back_populates="workspace", cascade="all, delete-orphan"
    )
    members = relationship(
        "WorkspaceMember", back_populates="workspace", cascade="all, delete-orphan"
    )

    # AI Configurations (BYOK)
    active_llm_provider = Column(String, nullable=True)
    active_llm_model = Column(String, nullable=True)
    active_embedding_provider = Column(String, nullable=True)
    active_embedding_model = Column(String, nullable=True)
