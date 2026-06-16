from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from core.database import Base
import uuid
from datetime import datetime, timezone


class WorkspaceCredential(Base):
    __tablename__ = "workspace_credentials"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String, ForeignKey("workspaces.id"), nullable=False)
    provider = Column(String, nullable=False)
    provider_type = Column(String, nullable=False)  # 'cloud' or 'local'
    encrypted_credential_json = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    workspace = relationship("Workspace", back_populates="credentials")
