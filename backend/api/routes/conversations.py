from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List
from core.database import get_db
from models.user import User
from models.conversation import Conversation, Message
from schemas.conversation import ConversationOut, ConversationWithMessagesOut
from api.deps import get_current_user, get_workspace_member

router = APIRouter(prefix="/conversations", tags=["Conversations"])

@router.get("", response_model=List[ConversationOut])
async def get_conversations(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await get_workspace_member(workspace_id, current_user, db)
    result = await db.execute(
        select(Conversation)
        .where(Conversation.workspace_id == workspace_id)
        .order_by(Conversation.updated_at.desc())
    )
    return result.scalars().all()

@router.get("/{conversation_id}/messages", response_model=ConversationWithMessagesOut)
async def get_conversation_messages(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == conversation_id)
    )
    conversation = result.scalars().first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    await get_workspace_member(conversation.workspace_id, current_user, db)
    return conversation

@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conversation_id)
    )
    conversation = result.scalars().first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    await get_workspace_member(conversation.workspace_id, current_user, db)
    await db.delete(conversation)
    await db.commit()
    return {"message": "Conversation deleted"}

