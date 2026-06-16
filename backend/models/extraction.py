from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Float, JSON
from sqlalchemy.orm import relationship
from core.database import Base
import uuid
from datetime import datetime, timezone


class ExtractionJob(Base):
    __tablename__ = "extraction_jobs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String, ForeignKey("workspaces.id"), nullable=False)
    name = Column(String, nullable=False)
    # JSON list of {"name": str, "type": str} field definitions
    fields = Column(JSON, nullable=False, default=list)
    # JSON list of document IDs to process
    document_ids = Column(JSON, nullable=False, default=list)
    status = Column(String, default="queued")  # queued | running | completed | failed
    processed_count = Column(Integer, default=0)
    doc_count = Column(Integer, default=0)
    # JSON: {document_id: {field_name: extracted_value, ...}, ...}
    results = Column(JSON, nullable=True)
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)

    workspace = relationship("Workspace")
