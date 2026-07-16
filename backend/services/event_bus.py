import logging
import asyncio
from collections import defaultdict
from typing import Callable, Awaitable, Dict, Any

logger = logging.getLogger(__name__)

class EventBus:
    _subscribers = defaultdict(list)
    
    @classmethod
    def subscribe(cls, event_type: str, callback: Callable[[Dict[str, Any]], Awaitable[None]]):
        cls._subscribers[event_type].append(callback)
        
    @classmethod
    async def publish(cls, event_type: str, data: Dict[str, Any]):
        tasks = [asyncio.create_task(cb(data)) for cb in cls._subscribers[event_type]]
        if tasks:
            # Prevent one crashing subscriber from affecting others
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    logger.exception(f"Subscriber {i} failed for event {event_type}", exc_info=result)
