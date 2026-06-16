"""
AgentTrace Model — DocuMind AI
================================
Menyimpan jejak eksekusi agent loop untuk observability dan debugging.
Setiap run agent dicatat lengkap: langkah-langkah tool calls, input/output, latensi.
"""

from sqlalchemy import Column, String, DateTime, Integer, Text, ForeignKey
from core.database import Base
import uuid
from datetime import datetime, timezone


class AgentTrace(Base):
    """
    Rekam jejak satu sesi agent run.

    Kolom `steps` adalah JSON list dengan format per langkah:
    [
      {
        "step": 1,
        "type": "tool_call",
        "tool_name": "search_documents",
        "tool_args": {"query": "...", "top_k": 5},
        "tool_result": {"hits": [...]},
        "latency_ms": 320,
        "timestamp": "2026-06-11T..."
      },
      {
        "step": 2,
        "type": "final_answer",
        "content": "...",
        "latency_ms": 1240,
        "timestamp": "..."
      }
    ]
    """

    __tablename__ = "agent_traces"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    user_query = Column(Text, nullable=False)

    # JSON list of agent steps (tool calls, observations, final answer)
    steps = Column(Text, nullable=True)  # JSON string

    # Final synthesized answer
    final_answer = Column(Text, nullable=True)

    # Jumlah iterasi yang digunakan (1-based, max = max_iterations)
    total_iterations = Column(Integer, default=0)

    # Status: "running" | "done" | "max_iterations_reached" | "error"
    status = Column(String, default="running")

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)
