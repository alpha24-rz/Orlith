import logging
import time
from sqlalchemy.ext.asyncio import AsyncSession
from models.document import Document
from models.workspace import Workspace
from services.context import PipelineContext
from services.text_extraction import TextExtractionService
from services.chunking_service import ChunkingService
from services.embedding_service import EmbeddingService
from typing import Callable, Awaitable, List

logger = logging.getLogger(__name__)

class PipelineHooks:
    def __init__(self):
        self._hooks = {
            "before_extract": [],
            "after_extract": [],
            "before_chunk": [],
            "after_chunk": [],
            "before_embedding": [],
            "after_embedding": []
        }

    def register(self, event: str, handler: Callable[..., Awaitable[None]]):
        if event in self._hooks:
            self._hooks[event].append(handler)
        else:
            logger.warning(f"Unknown hook event: {event}")

    async def trigger(self, event: str, *args, **kwargs):
        if event in self._hooks:
            for handler in self._hooks[event]:
                try:
                    await handler(*args, **kwargs)
                except Exception as e:
                    logger.exception(f"Hook '{event}' handler failed: {e}")

class DocumentPipeline:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.hooks = PipelineHooks()
        
        # Register Plugins (Hooks)
        from services.document_classifier import classification_hook
        self.hooks.register("after_extract", classification_hook)
        
        self.extractor = TextExtractionService()
        self.chunker = ChunkingService()
        self.embedder = EmbeddingService(db)

    async def process(self, document_id: str, ocr: bool, enqueue_time: float):
        ctx = PipelineContext(document_id, enqueue_time)
        
        document = await self.db.get(Document, document_id)
        if not document:
            logger.error(f"Document {document_id} not found")
            return

        workspace = await self.db.get(Workspace, document.workspace_id)
        if not workspace:
            logger.error(f"Workspace for document {document_id} not found")
            return

        try:
            # 1. PRE-EXTRACT
            await self.hooks.trigger("before_extract", ctx=ctx, document=document)
            pages, meta = await self.extractor.extract(document, ocr, ctx)
            await self.hooks.trigger("after_extract", ctx=ctx, document=document, pages=pages, meta=meta)
            
            # Setup providers via LLMGateway
            from services.ai.gateway import LLMGateway
            gateway = LLMGateway(self.db)
            embedding_provider, model_name = await gateway.get_embedding_provider(workspace)
            
            from core.config import settings
            provider_name = "huggingface"
            if settings.EMBEDDING_PROVIDER != "huggingface":
                provider_name = getattr(workspace, "active_embedding_provider", "openrouter") or "openrouter"
                if settings.GEMINI_API_KEY and provider_name == "gemini":
                    provider_name = "gemini"

            # 2. CHUNK
            await self.hooks.trigger("before_chunk", ctx=ctx, pages=pages, document=document)
            chunks = await self.chunker.chunk(
                pages, document, workspace, ctx, embedding_provider, model_name
            )
            await self.hooks.trigger("after_chunk", ctx=ctx, document=document, chunks=chunks)
            
            # 3. EMBED & STORE
            await self.hooks.trigger("before_embedding", ctx=ctx, chunks=chunks, document=document)
            await self.embedder.embed_and_store(
                document, chunks, workspace, ctx, embedding_provider, model_name, provider_name
            )
            await self.hooks.trigger("after_embedding", ctx=ctx, document=document)

            # Finalize Status
            ctx.transition("ready")
            metrics, status_history = ctx.finalize()
            
            document.status = "ready"
            
            if not document.metadata_json:
                document.metadata_json = {}
            document.metadata_json.update({
                "metrics": metrics,
                "status_history": status_history,
                **meta
            })

            # Additional fingerpint DB updates
            document.text_hash = meta.get("text_hash")
            document.page_count = meta.get("page_count", 0)

            await self.db.commit()
            
            # Publish Event
            from services.event_bus import EventBus
            await EventBus.publish("DocumentReadyEvent", {
                "document_id": document.id, 
                "metrics": metrics,
                "workspace_id": workspace.id
            })

        except Exception as e:
            logger.exception(f"Pipeline error for document {document_id}: {e}")
            document.status = "error"
            document.error_message = str(e)
            await self.db.commit()
            
            from services.event_bus import EventBus
            await EventBus.publish("DocumentFailedEvent", {
                "document_id": document.id,
                "error": str(e),
                "workspace_id": workspace.id
            })

