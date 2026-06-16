"""
UsageLog Model — DocuMind AI
==============================
Merekam penggunaan token dan estimasi biaya (USD) untuk setiap LLM call.
"""

from sqlalchemy import Column, String, DateTime, Integer, Float, ForeignKey
from core.database import Base
import uuid
from datetime import datetime, timezone


class UsageLog(Base):
    __tablename__ = "usage_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    provider = Column(String, nullable=False)           # "openai", "anthropic", "ollama", "openrouter"
    model = Column(String, nullable=False)              # e.g., "gpt-4o", "claude-3-5-sonnet-20240620"
    operation = Column(String, nullable=False)          # "chat", "embed", "agent", "research"
    prompt_tokens = Column(Integer, default=0, nullable=False)
    completion_tokens = Column(Integer, default=0, nullable=False)
    total_tokens = Column(Integer, default=0, nullable=False)
    estimated_cost_usd = Column(Float, default=0.0, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
