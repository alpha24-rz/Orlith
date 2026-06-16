import logging
from typing import AsyncIterator, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession

from services.ai.modes.chat import StandardChatMode
from services.ai.modes.agent import AgentMode
from services.ai.modes.research import DeepResearchMode

logger = logging.getLogger(__name__)

class AIOrchestrator:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def route_query(
        self,
        workspace_id: str,
        user_id: str,
        query: str,
        mode: str,
        conversation_id: str = None,
        conversation_history: List[Dict[str, str]] = None,
        max_context_tokens: int = 4000,
        enable_rewriting: bool = True,
        override_endpoint_id: str = None,
        override_model: str = None,
        **kwargs,
    ) -> AsyncIterator[str]:
        """
        Route the query to the correct reasoning mode and return an async generator streaming responses.
        """
        logger.info(f"Orchestrator routing query (mode={mode}) in workspace {workspace_id} for user {user_id}")
        
        mode_normalized = mode.lower().strip()
        if mode_normalized in ("chat", "standard", "rag"):
            chat_mode = StandardChatMode(self.db)
            async for chunk in chat_mode.execute(
                workspace_id=workspace_id,
                user_id=user_id,
                query=query,
                conversation_id=conversation_id,
                conversation_history=conversation_history or [],
                max_context_tokens=max_context_tokens,
                enable_rewriting=enable_rewriting,
                override_endpoint_id=override_endpoint_id,
                override_model=override_model,
            ):
                yield chunk
        elif mode_normalized == "agent":
            agent_mode = AgentMode(self.db)
            async for chunk in agent_mode.execute(
                workspace_id=workspace_id,
                user_id=user_id,
                query=query,
                conversation_id=conversation_id,
                conversation_history=conversation_history or [],
                max_context_tokens=max_context_tokens,
                enable_rewriting=enable_rewriting,
                override_endpoint_id=override_endpoint_id,
                override_model=override_model,
                **kwargs,
            ):
                yield chunk
        elif mode_normalized in ("research", "deep_research"):
            research_mode = DeepResearchMode(self.db)
            async for chunk in research_mode.execute(
                workspace_id=workspace_id,
                user_id=user_id,
                query=query,
                conversation_id=conversation_id,
                conversation_history=conversation_history or [],
                max_context_tokens=max_context_tokens,
                enable_rewriting=enable_rewriting,
                override_endpoint_id=override_endpoint_id,
                override_model=override_model,
                **kwargs,
            ):
                yield chunk
        else:
            raise ValueError(f"Unknown reasoning mode: '{mode}'")
