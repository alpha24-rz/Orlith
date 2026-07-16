from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, JSON
from sqlalchemy.orm import relationship
from core.database import Base
import uuid
from datetime import datetime, timezone


class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String, ForeignKey("workspaces.id"), nullable=False)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    file_size = Column(Integer, nullable=False)
    status = Column(String, default="uploading")  # uploading, processing, ready, error
    content_hash = Column(String, nullable=True)
    error_message = Column(String, nullable=True)
    page_count = Column(Integer, nullable=True)
    word_count = Column(Integer, nullable=True)
    mime_type = Column(String, nullable=True)
    text_hash = Column(String, nullable=True)
    # Document Metadata
    metadata_json = Column(
        JSON, nullable=True
    )  # stores page_count, chunk_count, language, etc.

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    workspace = relationship("Workspace", back_populates="documents")
