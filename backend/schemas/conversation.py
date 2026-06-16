from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from datetime import datetime

class MessageBase(BaseModel):
    role: str
    content: str
    provider: Optional[str] = None
    model: Optional[str] = None
    citations: Optional[List[Dict[str, Any]]] = None
    confidence: Optional[float] = None
    metadata_json: Optional[Dict[str, Any]] = None

class MessageCreate(MessageBase):
    conversation_id: str

class MessageOut(MessageBase):
    id: str
    conversation_id: str
    created_at: datetime

    class Config:
        from_attributes = True

class ConversationBase(BaseModel):
    workspace_id: str
    title: str

class ConversationCreate(ConversationBase):
    pass

class ConversationOut(ConversationBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ConversationWithMessagesOut(ConversationOut):
    messages: List[MessageOut] = []
