"""
ResearchJob Model — DocuMind AI
=================================
Merekam status dan hasil setiap job Deep Research.

Status lifecycle:
  pending → running → done
                    ↘ error
"""

from sqlalchemy import Column, String, DateTime, Text, ForeignKey
from core.database import Base
import uuid
from datetime import datetime, timezone


class ResearchJob(Base):
    """
    Satu sesi Deep Research yang bisa berjalan di background.

    Kolom `sub_questions` adalah JSON list string, misalnya:
    ["Apa kebijakan cuti tahunan?", "Siapa yang berwenang menyetujui cuti?"]

    Kolom `progress_log` adalah JSON list event progress, misalnya:
    [
      {"step": "plan", "message": "5 sub-questions generated", "ts": "..."},
      {"step": "searching", "question": "...", "chunks_found": 12, "ts": "..."},
      ...
    ]
    """

    __tablename__ = "research_jobs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)

    # Query riset original dari pengguna
    query = Column(Text, nullable=False)

    # Status: pending | running | done | error
    status = Column(String, default="pending", nullable=False)

    # Sub-questions yang di-generate saat planning phase (JSON array string)
    sub_questions = Column(Text, nullable=True)

    # Progress events selama riset berlangsung (JSON array)
    progress_log = Column(Text, nullable=True)

    # Laporan final dalam format Markdown
    result_markdown = Column(Text, nullable=True)

    # Jumlah total chunk yang dikumpulkan selama proses
    total_chunks_found = Column(String, nullable=True)

    # Error message jika status = error
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)
