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

            # Relevance Gate
            top_score = 0.0
            valid_chunks = []
            for chunk in chunks:
                score = 0.0
                if "relevance_score" in chunk:
                    score = chunk["relevance_score"]
                elif "distance" in chunk:
                    score = max(0.0, 1.0 - chunk["distance"])

                if score > top_score:
                    top_score = score
                
                # Threshold for relevance gate
                if score >= 0.45:
                    valid_chunks.append(chunk)

            # Determine Source Mode
            if top_score >= 0.70:
                source_mode = "DOCUMENT"
            elif top_score >= 0.45:
                source_mode = "HYBRID"
            else:
                source_mode = "GENERAL"
                valid_chunks = [] # Force general knowledge

            # 2. Build Citations
            from services.ai.postprocess import generate_citations, format_sse_meta, format_sse_text, format_llm_error_message
            valid_chunks_text, citations = generate_citations(valid_chunks)

            # Yield citations metadata
            meta_data = {
                "citations": citations,
                "model": chat_model,
                "confidence": round(top_score, 2),
                "queriesUsed": 1 if not enable_rewriting else 3,
                "conversation_id": conversation_id,
                "source_mode": source_mode,
                "retrieval_score": round(top_score, 4)
            }
            yield format_sse_meta(meta_data)

            context = (
                "\n\n---\n\n".join(valid_chunks_text)
                if valid_chunks_text
                else "Tidak ada dokumen relevan."
            )

            # 3. Assemble Unified System Prompt
            system_prompt = (
                "Kamu adalah DocuMind AI, asisten AI untuk workspace dokumen.\n\n"
                "ATURAN PRIORITAS (WAJIB DIIKUTI):\n"
                "1. Jika tersedia KONTEKS DOKUMEN yang relevan, gunakan itu sebagai sumber utama jawaban.\n"
                "2. Jika jawaban berasal dari dokumen, sertakan citation seperti [1] atau [2].\n"
                "3. Jika dokumen tidak relevan (kosong) atau pertanyaan bersifat umum (sapaan, chit-chat, pengetahuan publik), jawab secara natural menggunakan pengetahuan umum.\n"
                "4. Jika menjawab dari pengetahuan umum, tambahkan SATU disclaimer singkat di awal jawaban: \"Berdasarkan pengetahuan umum saya (karena tidak ditemukan informasi relevan di dokumen)...\"\n"
                "5. Jangan mengarang isi dokumen. Jika dokumen tampak relevan tetapi tidak cukup untuk menjawab, katakan bahwa informasinya tidak ditemukan secara eksplisit.\n\n"
                "ATURAN FORMATTING (WAJIB DIIKUTI):\n"
                "1. Gunakan Markdown secara ekstensif agar jawaban mudah dibaca.\n"
                "2. Jika data terstruktur (perbandingan, dll), gunakan Markdown Table.\n"
                "3. Gunakan fenced code blocks untuk kode (```language ... ```), tetapi JANGAN bungkus seluruh jawaban dalam satu blok kode.\n"
                "4. Gunakan bullet points atau daftar bernomor jika diperlukan.\n\n"
                f"STATUS RETRIEVAL: {'DOCUMENT_AVAILABLE' if valid_chunks_text else 'DOCUMENT_NOT_RELEVANT'}\n"
                f"KONTEKS DOKUMEN:\n{context}"
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
                error_msg = format_llm_error_message(e)
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
                
                ai_msg = Message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=accumulated_text,
                    provider=endpoint_name,
                    model=chat_model,
                    citations=citations,
                    confidence=round(top_score, 2),
                    metadata_json={
                        "queriesUsed": meta_data.get("queriesUsed"),
                        "source_mode": source_mode,
                        "retrieval_score": round(top_score, 4)
                    }
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
