from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from core.database import Base
import uuid
from datetime import datetime, timezone

class UserMemory(Base):
    __tablename__ = "user_memories"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    key = Column(String, nullable=False)
    value = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
