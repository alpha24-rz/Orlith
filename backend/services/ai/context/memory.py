import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.user_memory import UserMemory

logger = logging.getLogger(__name__)

async def get_user_memories(db: AsyncSession, user_id: str) -> list[UserMemory]:
    """
    Fetch all memory snippets for a user.
    """
    try:
        result = await db.execute(
            select(UserMemory).where(UserMemory.user_id == user_id).order_by(UserMemory.created_at.desc())
        )
        return list(result.scalars().all())
    except Exception as e:
        logger.error(f"Error fetching memories for user {user_id}: {e}")
        return []

async def save_user_memory(db: AsyncSession, user_id: str, key: str, value: str) -> UserMemory:
    """
    Save or update a memory snippet for a user.
    If the key already exists, updates it.
    """
    try:
        result = await db.execute(
            select(UserMemory).where(UserMemory.user_id == user_id, UserMemory.key == key)
        )
        existing = result.scalars().first()
        if existing:
            existing.value = value
            memory = existing
        else:
            memory = UserMemory(user_id=user_id, key=key, value=value)
            db.add(memory)
        
        await db.commit()
        await db.refresh(memory)
        return memory
    except Exception as e:
        await db.rollback()
        logger.error(f"Error saving memory for user {user_id} (key={key}): {e}")
        raise e

async def delete_user_memory(db: AsyncSession, user_id: str, key: str) -> bool:
    """
    Delete a memory snippet for a user by key.
    """
    try:
        result = await db.execute(
            select(UserMemory).where(UserMemory.user_id == user_id, UserMemory.key == key)
        )
        existing = result.scalars().first()
        if existing:
            await db.delete(existing)
            await db.commit()
            return True
        return False
    except Exception as e:
        await db.rollback()
        logger.error(f"Error deleting memory for user {user_id} (key={key}): {e}")
        return False

def format_memories_for_prompt(memories: list[UserMemory]) -> str:
    """
    Format user memories as a system instruction string.
    """
    if not memories:
        return ""
    
    formatted = []
    for m in memories:
        formatted.append(f"- {m.key}: {m.value}")
    
    return (
        "USER MEMORY & PREFERENCES:\n"
        + "\n".join(formatted)
        + "\n\nPlease respect and apply these preferences/context in your responses if applicable."
    )
