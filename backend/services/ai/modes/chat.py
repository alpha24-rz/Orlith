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

        # Check if conversation exists in DB
        conversation_exists = False
        if conversation_id and not conversation_id.startswith("temp_"):
            from sqlalchemy import select
            stmt = select(Conversation).where(Conversation.id == conversation_id)
            res = await self.db.execute(stmt)
            conversation_exists = res.scalar_one_or_none() is not None

        if not conversation_id or conversation_id.startswith("temp_") or not conversation_exists:
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
            # Configure Retrieval Layer dynamically (SOTA RAG 2.0)
            from core.config import settings
            from services.ai.retrieval.config import RetrievalConfig
            retrieval_config = RetrievalConfig(
                enable_hybrid_search=settings.ENABLE_HYBRID_SEARCH,
                enable_reranker=settings.ENABLE_RERANKER,
                enable_hyde=settings.ENABLE_HYDE,
                enable_chunk_stitching=settings.ENABLE_CHUNK_STITCHING,
                candidate_pool_size=settings.RAG_CANDIDATE_POOL_SIZE,
                final_top_k=settings.RAG_FINAL_TOP_K,
                vector_distance_cutoff=settings.VECTOR_SEARCH_DISTANCE_CUTOFF,
                bm25_top_k=settings.BM25_TOP_K,
                rrf_k=settings.RRF_K,
                reranker_model=settings.RERANKER_MODEL
            )

            # 1. Retrieval Layer (Dense + Sparse BM25 + Multi-Query RRF + Reranker + Stitching)
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
            from services.ai.postprocess.citations import calculate_calibrated_relevance
            relevance_threshold = settings.RAG_SIMILARITY_THRESHOLD
            top_score = 0.0
            valid_chunks = []

            for chunk in chunks:
                score = calculate_calibrated_relevance(chunk)
                chunk["relevance_score"] = score
                if score > top_score:
                    top_score = score
                
                # Threshold for relevance gate
                if score >= relevance_threshold:
                    valid_chunks.append(chunk)

            # Determine Source Mode
            if top_score >= 0.70:
                source_mode = "DOCUMENT"
            elif top_score >= relevance_threshold:
                source_mode = "HYBRID"
            else:
                source_mode = "GENERAL"
                valid_chunks = [] # Fallback to general knowledge

            # 2. Build Citations & Rich Context (Injecting parent_content for LLM)
            from services.ai.postprocess import generate_citations, format_sse_meta, format_sse_text, format_llm_error_message
            valid_chunks_text, citations = generate_citations(valid_chunks)

            # Yield citations metadata
            meta_data = {
                "citations": citations,
                "model": chat_model,
                "confidence": round(top_score, 2),
                "queriesUsed": 1 if not enable_rewriting else (4 if settings.ENABLE_HYDE else 3),
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

            # 3. Assemble Unified Grounded System Prompt
            system_prompt = (
                "Kamu adalah ORLITH AI, asisten AI cerdas untuk analisis dokumen perusahaan (Corporate Brain).\n\n"
                "ATURAN PRIORITAS (WAJIB DIIKUTI):\n"
                "1. Jika tersedia KONTEKS DOKUMEN di bawah, jadikan itu sebagai rujukan utama kebenaran jawaban.\n"
                "2. Setiap klaim, fakta, angka, atau pernyataan yang diambil dari dokumen WAJIB disertai nomor sitasi seperti [1], [2] sesuai urutan dokumen di konteks.\n"
                "3. Jelaskan jawaban secara komprehensif, runtut, dan langsung menjawab inti pertanyaan.\n"
                "4. Jika informasi pada dokumen hanya menjawab sebagian pertanyaan, jawab bagian yang ada disertai sitasi dan nyatakan dengan jujur bagian mana yang tidak tertulis di dokumen.\n"
                "5. Jika dokumen sama sekali tidak relevan atau kosong, jawab menggunakan pengetahuan umummu dengan memberikan catatan singkat: 'Berdasarkan pengetahuan umum (karena tidak ditemukan rincian di dokumen)...'.\n"
                "6. JANGAN mengarang (halusinasi) pasal, klausul, nama pihak, atau angka yang tidak terdapat dalam teks dokumen.\n\n"
                "STANDAR FORMAT OUTPUT (SANGAT PENTING - WAJIB PATUH):\n"
                "- RUMUS MATEMATIKA / PERSAMAAN / SAINS:\n"
                "  * Wajib gunakan format LaTeX standar.\n"
                "  * Untuk rumus dalam kalimat (inline), apit dengan tanda satu dollar, contoh: $E = mc^2$ atau $\\mu = \\frac{1}{N}\\sum_{i=1}^N x_i$.\n"
                "  * Untuk rumus mandiri / blok terpisah (display block), apit dengan tanda dua dollar pada baris baru terpisah, contoh:\n"
                "    $$\n"
                "    \\sigma = \\sqrt{\\frac{1}{N} \\sum_{i=1}^{N} (x_i - \\mu)^2}\n"
                "    $$\n"
                "  * JANGAN gunakan teks polos ASCII untuk rumus (hindari 'sum_(i=1)^N' tanpa LaTeX).\n\n"
                "- TABEL DATA / KOMPARASI:\n"
                "  * Sajikan data perbandingan, angka, klausul, atau parameter dalam format GitHub Flavored Markdown (GFM) Table yang rapi.\n"
                "  * Wajib sertakan baris header dan garis pemisah kolom yang valid, contoh:\n"
                "    | Parameter | Keterangan | Nilai |\n"
                "    | :--- | :--- | :--- |\n"
                "    | Akurasi | Nilai pengujian | 98.5% |\n\n"
                "- KODE PROGRAM / SCRIPT:\n"
                "  * Wajib gunakan fenced code blocks dengan menyebutkan nama bahasa secara eksplisit (misal: ```python, ```javascript, ```typescript, ```sql, ```bash, ```json, dll).\n"
                "  * Berikan indentasi yang rapi dan komentar penjelasan pada baris kunci.\n\n"
                "- STRUKTUR & KETERBACAAN:\n"
                "  * Gunakan hierarki heading yang rapi (`###`, `####`).\n"
                "  * Gunakan bullet points atau penomoran untuk menjelaskan langkah atau poin-poin secara sistematis.\n"
                "  * Tuliskan sitasi dokumen secara inline di akhir klaim yang relevan, misal: '...hak cuti tahunan adalah 12 hari kerja [1].'\n\n"
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
            # Save assistant message & history BEFORE yielding [DONE]
            effective_provider = (
                endpoint_name
                or getattr(workspace, "active_llm_provider", None)
                or getattr(settings, "LLM_PROVIDER", "ollama")
            )

            # 1. Save Assistant Message
            try:
                ai_msg = Message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=accumulated_text or "",
                    provider=effective_provider,
                    model=chat_model,
                    citations=citations if citations else None,
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
                logger.error(f"Failed to save assistant message: {e}")

            # 2. Save Query History
            try:
                history = QueryHistory(
                    workspace_id=workspace.id,
                    query_text=query,
                    response_text=accumulated_text or "",
                )
                self.db.add(history)
                await self.db.commit()
            except Exception as e:
                logger.error(f"Failed to save query history: {e}")

            # 3. Cost Tracking & Usage Log
            try:
                from services.cost_calculator import log_usage
                await log_usage(
                    db=self.db,
                    workspace_id=workspace.id,
                    provider=effective_provider,
                    model=chat_model,
                    operation="chat",
                    prompt_content=messages,
                    completion_content=accumulated_text or "",
                )
            except Exception as e:
                logger.error(f"Failed to log RAG usage: {e}")

            # 4. Yield completion event to frontend AFTER DB commit is done
            yield "data: [DONE]\n\n"
