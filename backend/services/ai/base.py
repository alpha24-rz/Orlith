from abc import ABC, abstractmethod
from typing import AsyncIterator, List, Dict
from sqlalchemy.ext.asyncio import AsyncSession

class BaseReasoningMode(ABC):
    def __init__(self, db: AsyncSession):
        self.db = db

    @abstractmethod
    async def execute(
        self,
        workspace_id: str,
        user_id: str,
        query: str,
        conversation_id: str = None,
        conversation_history: list = None,
        max_context_tokens: int = 4000,
        enable_rewriting: bool = True,
        override_endpoint_id: str = None,
        override_model: str = None,
        **kwargs,
    ) -> AsyncIterator[str]:
        """
        Execute the reasoning mode and return an async stream of tokens/responses.
        """
        pass
