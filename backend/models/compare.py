"""
Model Compare Model — DocuMind AI
==================================
Menyimpan riwayat uji tanding model (Model Comparison / Blind Test) beserta vote dari pengguna.
"""

from sqlalchemy import Column, String, DateTime, Text, ForeignKey
from core.database import Base
import uuid
from datetime import datetime, timezone


class ModelCompareVote(Base):
    __tablename__ = "model_compare_votes"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    query_text = Column(Text, nullable=False)
    model_a = Column(String, nullable=False)
    model_b = Column(String, nullable=False)
    response_a = Column(Text, nullable=False)
    response_b = Column(Text, nullable=False)
    # Pilihan user: "model_a" | "model_b" | "tie"
    vote = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
