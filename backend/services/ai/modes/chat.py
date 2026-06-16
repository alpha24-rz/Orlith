import json
import logging
from typing import AsyncIterator, List, Dict

from models import Workspace, QueryHistory, Conversation, Message
from services.ai.base import BaseReasoningMode
from services.ai.gateway import LLMGateway
from services.ai.context.manager import ContextManager
from services.ai.retrieval.search import retrieve_relevant_chunks

logger = logging.getLogger(__name__)

class StandardChatMode(BaseReasoningMode):
    async def execute(
        self,
        workspace_id: str,
        user_id: str,
        query: str,
        conversation_id: str = None,
        conversation_history: List[Dict[str, str]] = None,
        max_context_tokens: int = 4000,
        enable_rewriting: bool = True,
        override_endpoint_id: str = None,
        override_model: str = None,
    ) -> AsyncIterator[str]:
        workspace = await self.db.get(Workspace, workspace_id)
        if not workspace:
            yield f"data: {json.dumps({'text': 'Error: Workspace not found'})}\n\n"
            yield "data: [DONE]\n\n"
            return

        endpoint_name = override_endpoint_id

        gateway = LLMGateway(self.db)
        try:
            chat_adapter, chat_model = await gateway.get_chat_provider(
                workspace, override_endpoint_id, override_model
            )
        except Exception as e:
            yield f"data: {json.dumps({'text': f'Error: Provider configuration issue - {str(e)}'})}\n\n"
            yield "data: [DONE]\n\n"
            return

        if not conversation_id:
            title = query[:40] + "..." if len(query) > 40 else query
            conversation = Conversation(workspace_id=workspace_id, title=title)
            self.db.add(conversation)
            await self.db.commit()
            conversation_id = conversation.id
        
        # Insert user message
        user_msg = Message(
            conversation_id=conversation_id,
            role="user",
            content=query,
        )
        self.db.add(user_msg)
        await self.db.commit()

        try:
            # Configure Retrieval Layer dynamically
            from core.config import settings
            from services.ai.retrieval.config import RetrievalConfig
            retrieval_config = RetrievalConfig(
                enable_hybrid_search=settings.ENABLE_HYBRID_SEARCH,
                enable_reranker=settings.ENABLE_RERANKER,
                candidate_pool_size=settings.RAG_CANDIDATE_POOL_SIZE,
                final_top_k=settings.RAG_FINAL_TOP_K,
                bm25_top_k=settings.BM25_TOP_K,
                rrf_k=settings.RRF_K,
                reranker_model=settings.RERANKER_MODEL
            )

            # 1. Retrieval Layer
            chunks = await retrieve_relevant_chunks(
                workspace_id=workspace_id,
                query=query,
                db=self.db,
                enable_rewriting=enable_rewriting,
                override_endpoint_id=override_endpoint_id,
                override_model=override_model,
                retrieval_config=retrieval_config
            )

            # 2. Build Citations
            from services.ai.postprocess import generate_citations, format_sse_meta, format_sse_text
            valid_chunks_text, citations = generate_citations(chunks)

            # Yield citations metadata
            meta_data = {
                "citations": citations,
                "model": chat_model,
                "confidence": 0.92,
                "queriesUsed": 1 if not enable_rewriting else 3,
                "conversation_id": conversation_id
            }
            yield format_sse_meta(meta_data)

            context = (
                "\n\n---\n\n".join(valid_chunks_text)
                if valid_chunks_text
                else "Tidak ada konteks relevan yang ditemukan dalam workspace."
            )

            # 3. Assemble System Prompt
            if valid_chunks_text:
                system_prompt = (
                    "Kamu adalah DocuMind AI, asisten dokumen yang cerdas dan teliti. "
                    "Jawab pertanyaan pengguna HANYA berdasarkan konteks dokumen yang disediakan.\n\n"
                    "ATURAN CITATION (WAJIB DIIKUTI):\n"
                    "1. Setiap kali kamu menggunakan informasi dari konteks, WAJIB tambahkan citation "
                    "dalam format [N] tepat setelah kalimat yang menggunakan info tersebut.\n"
                    "2. Jika satu kalimat menggunakan info dari beberapa sumber, gunakan [1][3] atau [1, 3].\n"
                    "3. JANGAN gunakan informasi di luar konteks yang diberikan.\n"
                    "4. Jika informasi tidak ada dalam konteks, katakan dengan jelas: "
                    "\"Informasi ini tidak ditemukan dalam dokumen yang tersedia.\"\n\n"
                    "Contoh format yang benar:\n"
                    "\"Karyawan berhak atas 12 hari cuti tahunan [1]. "
                    "Pengajuan cuti harus dilakukan minimal 3 hari sebelumnya [2].\"\n\n"
                    f"KONTEKS DOKUMEN:\n{context}"
                )
            else:
                system_prompt = (
                    "Kamu adalah DocuMind AI, asisten dokumen yang cerdas. "
                    "Tidak ada dokumen relevan yang ditemukan dalam workspace untuk menjawab pertanyaan ini. "
                    "Informasikan hal ini kepada pengguna dan sarankan untuk mengunggah dokumen yang relevan "
                    "atau mengubah pertanyaan dengan kata kunci yang berbeda."
                )

            # 4. Context Management (Memory Injection + History Compaction)
            context_manager = ContextManager(self.db)
            messages = await context_manager.get_processed_context(
                user_id=user_id or workspace.owner_id,
                workspace_id=workspace_id,
                conversation_history=conversation_history or [],
                chat_adapter=chat_adapter,
                model=chat_model,
                system_prompt=system_prompt,
                max_context_tokens=max_context_tokens,
                temperature=0.1,
            )
            messages.append({"role": "user", "content": query})

            # 5. LLM Inference + Streaming
            accumulated_text = ""
            try:
                response_stream = chat_adapter.stream_response(
                    messages=messages,
                    model=chat_model,
                    temperature=0.1,
                )

                async for chunk in response_stream:
                    accumulated_text += chunk
                    yield format_sse_text(chunk)

            except Exception as e:
                error_msg = f"\n\nError saat generasi: {str(e)}"
                accumulated_text += error_msg
                yield format_sse_text(error_msg)

        except Exception as general_error:
            from services.ai.postprocess import format_sse_text
            error_msg = f"Terjadi kesalahan pada sistem backend: {str(general_error)}"
            accumulated_text = error_msg
            yield format_sse_text(error_msg)

        finally:
            yield "data: [DONE]\n\n"

            # Save query history
            try:
                history = QueryHistory(
                    workspace_id=workspace.id,
                    query_text=query,
                    response_text=accumulated_text,
                )
                self.db.add(history)
                
                # Save assistant message
                ai_msg = Message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=accumulated_text,
                    provider=endpoint_name,
                    model=chat_model,
                    citations=citations,
                    confidence=0.92,
                    metadata_json={"queriesUsed": meta_data.get("queriesUsed")}
                )
                self.db.add(ai_msg)
                
                await self.db.commit()
            except Exception as e:
                logger.error(f"Failed to save history or message: {e}")

            # Cost Tracking & Usage Log
            try:
                from services.cost_calculator import log_usage
                await log_usage(
                    db=self.db,
                    workspace_id=workspace.id,
                    provider=endpoint_name,
                    model=chat_model,
                    operation="chat",
                    prompt_content=messages,
                    completion_content=accumulated_text,
                )
            except Exception as e:
                logger.error(f"Failed to log RAG usage: {e}")
