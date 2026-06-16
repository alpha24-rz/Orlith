import logging
from typing import List, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from services.ai.providers.base import ILLMProvider
from services.ai.context.compactor import compact_context
from services.ai.context.memory import get_user_memories, format_memories_for_prompt

logger = logging.getLogger(__name__)

class ContextManager:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_processed_context(
        self,
        user_id: str,
        workspace_id: str,
        conversation_history: List[Dict[str, str]],
        chat_adapter: ILLMProvider,
        model: str,
        system_prompt: str,
        max_context_tokens: int = 4000,
        temperature: float = 0.1,
    ) -> List[Dict[str, str]]:
        """
        Coordinate history extraction, memory injection, and compaction logic in one unified pass.
        Returns the list of messages ready to be sent to the LLM (including system prompt, memories, and history).
        """
        # 1. Fetch and format user memory
        memories = await get_user_memories(self.db, user_id)
        memory_str = format_memories_for_prompt(memories)

        # Combine system prompt with memory instructions if memory exists
        final_system_prompt = system_prompt
        if memory_str:
            final_system_prompt = f"{system_prompt}\n\n{memory_str}"

        # 2. Compact history if it exceeds context limit
        try:
            compacted_history = await compact_context(
                conversation_history=conversation_history,
                chat_adapter=chat_adapter,
                model=model,
                max_context_tokens=max_context_tokens,
                temperature=temperature,
                db=self.db,
                workspace_id=workspace_id,
            )
        except Exception as e:
            logger.warning(f"Context compaction failed, using fallback: {e}")
            compacted_history = conversation_history[-5:] if conversation_history else []

        # 3. Assemble the final messages payload
        messages = [{"role": "system", "content": final_system_prompt}]
        messages.extend(compacted_history)
        
        return messages
