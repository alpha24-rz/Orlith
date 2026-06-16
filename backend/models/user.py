from sqlalchemy import Column, String, DateTime
from sqlalchemy.orm import relationship
from core.database import Base
import uuid
from datetime import datetime, timezone


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    workspaces = relationship(
        "Workspace", back_populates="owner", cascade="all, delete-orphan"
    )
    api_keys = relationship(
        "UserAPIKey", back_populates="user", cascade="all, delete-orphan"
    )
    workspace_memberships = relationship(
        "WorkspaceMember", back_populates="user", cascade="all, delete-orphan"
    )
    # removed ModelEndpoint relationship
