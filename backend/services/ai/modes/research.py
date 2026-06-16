import json
import logging
import time
from datetime import datetime, timezone
from typing import AsyncIterator, List, Dict, Tuple, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models import Workspace, Document, ResearchJob
from services.ai.base import BaseReasoningMode
from services.ai.gateway import LLMGateway
from services.ai.context.manager import ContextManager
from services.ai.tools import get_default_registry

logger = logging.getLogger(__name__)

# Constants matching legacy deep research
MAX_EXTRA_ITERATIONS = 2
TARGET_SUB_QUESTIONS = 4
MIN_CHUNKS_PER_QUESTION = 2

class DeepResearchMode(BaseReasoningMode):
    async def execute(
        self,
        workspace_id: str,
        user_id: str,
        query: str,
        conversation_history: List[Dict[str, str]] = None,
        max_context_tokens: int = 4000,
        enable_rewriting: bool = True,
        override_endpoint_id: str = None,
        override_model: str = None,
        job_id: str = None,
        **kwargs,
    ) -> AsyncIterator[str]:
        # 1. Retrieve Workspace and ResearchJob
        workspace = await self.db.get(Workspace, workspace_id)
        if not workspace:
            yield self._evt("error", {"message": "Workspace tidak ditemukan"})
            yield "data: [DONE]\n\n"
            return

        if not job_id:
            # Create a research job dynamically if not provided
            job = ResearchJob(
                workspace_id=workspace_id,
                query=query,
                status="pending",
            )
            self.db.add(job)
            await self.db.commit()
            await self.db.refresh(job)
            job_id = job.id
        else:
            job = await self.db.get(ResearchJob, job_id)
            if not job:
                yield self._evt("error", {"message": "Research job tidak ditemukan"})
                yield "data: [DONE]\n\n"
                return

        # 2. Setup LLM & Embedding Providers
        gateway = LLMGateway(self.db)
        try:
            embedding_provider, embed_model = await gateway.get_embedding_provider(workspace)
            chat_adapter, chat_model = await gateway.get_chat_provider(
                workspace, override_endpoint_id, override_model
            )
            endpoint_name = override_endpoint_id
        except Exception as e:
            await self._update_job(job, status="error", error=str(e))
            yield self._evt("error", {"message": f"Provider error: {str(e)}"})
            yield "data: [DONE]\n\n"
            return

        # 3. Initialize Tool Registry
        tool_registry = get_default_registry()

        # Update job status
        job.status = "running"
        await self.db.commit()

        progress_log = []
        all_sources: List[Dict] = []
        total_chunks = 0

        try:
            # ════════════════════════════════════════════════
            # STEP 1: PLAN — Generate sub-questions
            # ════════════════════════════════════════════════
            yield self._evt("plan_start", {"message": "Menyusun rencana penelitian..."})

            sub_questions = await self._generate_sub_questions(
                query=query,
                chat_adapter=chat_adapter,
                chat_model=chat_model,
                num_questions=TARGET_SUB_QUESTIONS,
                workspace_id=workspace.id,
                chat_adapter_name=endpoint_name,
            )

            if not sub_questions:
                sub_questions = [query]

            job.sub_questions = json.dumps(sub_questions, ensure_ascii=False)
            await self.db.commit()

            self._log(progress_log, "plan", f"{len(sub_questions)} sub-questions generated")
            yield self._evt("plan", {
                "sub_questions": sub_questions,
                "count": len(sub_questions),
            })

            # ════════════════════════════════════════════════
            # STEP 2 & 3: SEARCH + SYNTHESIZE per sub-question
            # ════════════════════════════════════════════════
            syntheses: List[Dict] = []

            for i, question in enumerate(sub_questions):
                yield self._evt("searching", {
                    "question": question,
                    "index": i + 1,
                    "total": len(sub_questions),
                })

                # Retrieve chunks using ToolRegistry
                tool_result = await tool_registry.execute(
                    "search_documents",
                    query=question,
                    top_k=6,
                    db=self.db,
                    workspace=workspace,
                    embedding_provider=embedding_provider,
                    embed_model=embed_model,
                )

                hits = tool_result.get("hits", [])
                chunks = []
                for hit in hits:
                    if hit.get("relevance", 0.0) >= 0.5:
                        chunks.append({
                            "text": hit.get("text", hit.get("excerpt", "")),
                            "filename": hit.get("filename", "Unknown"),
                            "page": hit.get("page", 1),
                            "doc_id": hit.get("doc_id", ""),
                            "relevance": hit.get("relevance", 0.0),
                        })

                total_chunks += len(chunks)

                self._log(progress_log, "search", f"Q{i+1}: {len(chunks)} chunks found for '{question[:50]}'")
                yield self._evt("found", {
                    "question": question,
                    "index": i + 1,
                    "chunks_found": len(chunks),
                })

                # Track sources
                for chunk in chunks:
                    source_key = f"{chunk['filename']}::p{chunk['page']}"
                    if not any(s.get("key") == source_key for s in all_sources):
                        all_sources.append({
                            "key": source_key,
                            "filename": chunk["filename"],
                            "page": chunk["page"],
                            "doc_id": chunk.get("doc_id", ""),
                            "relevance": chunk.get("relevance", 0),
                        })

                # Synthesize
                yield self._evt("synthesizing", {
                    "question": question,
                    "index": i + 1,
                })

                if chunks:
                    summary = await self._synthesize_question(
                        question=question,
                        chunks=chunks,
                        chat_adapter=chat_adapter,
                        chat_model=chat_model,
                        workspace_id=workspace.id,
                        chat_adapter_name=endpoint_name,
                        user_id=user_id,
                    )
                else:
                    summary = f"Tidak ditemukan informasi yang cukup relevan untuk menjawab: '{question}'"

                syntheses.append({
                    "question": question,
                    "summary": summary,
                    "sources": [c for c in chunks[:3]],
                    "chunks_found": len(chunks),
                })

                self._log(progress_log, "synthesized", f"Q{i+1}: {len(summary)} chars")
                yield self._evt("synthesized", {
                    "question": question,
                    "index": i + 1,
                    "summary_length": len(summary),
                    "chunks_found": len(chunks),
                })

            # ════════════════════════════════════════════════
            # STEP 4: ITERATE — Gap filling
            # ════════════════════════════════════════════════
            weak_questions = [s for s in syntheses if s["chunks_found"] < MIN_CHUNKS_PER_QUESTION]

            if weak_questions and len(syntheses) < TARGET_SUB_QUESTIONS + MAX_EXTRA_ITERATIONS * 2:
                yield self._evt("iterating", {
                    "reason": f"{len(weak_questions)} pertanyaan memerlukan informasi tambahan",
                    "weak_questions": [w["question"] for w in weak_questions],
                })

                extra_questions = await self._generate_followup_questions(
                    original_query=query,
                    weak_syntheses=weak_questions,
                    chat_adapter=chat_adapter,
                    chat_model=chat_model,
                    workspace_id=workspace.id,
                    chat_adapter_name=endpoint_name,
                )

                for eq in extra_questions[:MAX_EXTRA_ITERATIONS]:
                    yield self._evt("searching", {
                        "question": eq,
                        "index": len(syntheses) + 1,
                        "total": len(sub_questions) + len(extra_questions),
                        "is_followup": True,
                    })

                    tool_result = await tool_registry.execute(
                        "search_documents",
                        query=eq,
                        top_k=6,
                        db=self.db,
                        workspace=workspace,
                        embedding_provider=embedding_provider,
                        embed_model=embed_model,
                    )

                    hits = tool_result.get("hits", [])
                    chunks = []
                    for hit in hits:
                        if hit.get("relevance", 0.0) >= 0.5:
                            chunks.append({
                                "text": hit.get("text", hit.get("excerpt", "")),
                                "filename": hit.get("filename", "Unknown"),
                                "page": hit.get("page", 1),
                                "doc_id": hit.get("doc_id", ""),
                                "relevance": hit.get("relevance", 0.0),
                            })

                    total_chunks += len(chunks)

                    yield self._evt("found", {
                        "question": eq,
                        "index": len(syntheses) + 1,
                        "chunks_found": len(chunks),
                        "is_followup": True,
                    })

                    if chunks:
                        summary = await self._synthesize_question(
                            question=eq,
                            chunks=chunks,
                            chat_adapter=chat_adapter,
                            chat_model=chat_model,
                            workspace_id=workspace.id,
                            chat_adapter_name=endpoint_name,
                            user_id=user_id,
                        )
                        syntheses.append({
                            "question": eq,
                            "summary": summary,
                            "sources": chunks[:3],
                            "chunks_found": len(chunks),
                            "is_followup": True,
                        })

            # ════════════════════════════════════════════════
            # STEP 5: REPORT — Final Markdown Report
            # ════════════════════════════════════════════════
            yield self._evt("writing_report", {
                "total_chunks": total_chunks,
                "total_sources": len(all_sources),
                "syntheses_count": len(syntheses),
            })

            report_markdown = await self._write_final_report(
                original_query=query,
                syntheses=syntheses,
                all_sources=all_sources,
                chat_adapter=chat_adapter,
                chat_model=chat_model,
                workspace_id=workspace.id,
                chat_adapter_name=endpoint_name,
                user_id=user_id,
            )

            self._log(progress_log, "report", f"Report generated: {len(report_markdown)} chars")

            # Update database
            job.status = "done"
            job.result_markdown = report_markdown
            job.total_chunks_found = str(total_chunks)
            job.progress_log = json.dumps(progress_log, ensure_ascii=False)
            job.completed_at = datetime.now(timezone.utc)
            await self.db.commit()

            yield self._evt("done", {
                "job_id": job_id,
                "report_length": len(report_markdown),
                "total_chunks": total_chunks,
                "total_sources": len(all_sources),
                "sub_questions_count": len(sub_questions),
            })

        except Exception as e:
            logger.error(f"Deep research failed for job {job_id}: {e}", exc_info=True)
            await self._update_job(job, status="error", error=str(e), progress=progress_log)
            yield self._evt("error", {"message": f"Research gagal: {str(e)}"})

        yield "data: [DONE]\n\n"

    async def _generate_sub_questions(
        self,
        query: str,
        chat_adapter,
        chat_model: str,
        num_questions: int,
        workspace_id: str,
        chat_adapter_name: str,
    ) -> List[str]:
        prompt = [
            {
                "role": "system",
                "content": (
                    "Kamu adalah research assistant yang bertugas memecah pertanyaan riset utama "
                    "menjadi sub-pertanyaan yang lebih spesifik dan dapat dijawab dari dokumen.\n\n"
                    "ATURAN:\n"
                    "1. Buat pertanyaan yang berbeda sudut pandangnya\n"
                    "2. Fokus pada aspek yang bisa ditemukan di dokumen bisnis/legal/keuangan\n"
                    "3. Return HANYA JSON array string, tanpa teks lain\n"
                    f"4. Buat tepat {num_questions} pertanyaan\n\n"
                    "Format: [\"pertanyaan 1\", \"pertanyaan 2\", ...]"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Query riset utama: \"{query}\"\n\n"
                    f"Buat {num_questions} sub-pertanyaan spesifik dalam Bahasa Indonesia "
                    "yang akan membantu menjawab query utama secara komprehensif:"
                ),
            }
        ]

        try:
            response = await chat_adapter.generate_response(
                messages=prompt,
                model=chat_model,
                temperature=0.4,
                max_tokens=512,
            )
            response = response.strip()
            await self._log_llm_usage(workspace_id, chat_adapter_name, chat_model, prompt, response)

            if "```" in response:
                start = response.find("[")
                end = response.rfind("]") + 1
                if start != -1 and end > start:
                    response = response[start:end]

            questions = json.loads(response)
            if isinstance(questions, list) and all(isinstance(q, str) for q in questions):
                return [q.strip() for q in questions if q.strip()]
        except Exception as e:
            logger.warning(f"Sub-question generation failed: {e}")

        # Fallback
        return [
            query,
            f"Apa definisi dan konteks dari: {query}",
            f"Siapa yang bertanggung jawab terkait: {query}",
            f"Apa syarat dan ketentuan terkait: {query}",
        ][:num_questions]

    async def _synthesize_question(
        self,
        question: str,
        chunks: List[Dict],
        chat_adapter,
        chat_model: str,
        workspace_id: str,
        chat_adapter_name: str,
        user_id: str = None,
    ) -> str:
        context_parts = []
        for i, chunk in enumerate(chunks[:5]):
            context_parts.append(
                f"[Sumber {i+1}] {chunk['filename']}, Hal. {chunk['page']}\n{chunk['text']}"
            )
        context = "\n\n---\n\n".join(context_parts)

        system_instruction = (
            "Kamu adalah research analyst yang bertugas mensintesis informasi dari dokumen. "
            "Jawab pertanyaan berikut berdasarkan HANYA informasi yang ada di konteks. "
            "Sertakan referensi sumber menggunakan format [Sumber N]. "
            "Jika informasi tidak cukup, nyatakan dengan jelas. "
            "Tulis dalam Bahasa Indonesia yang profesional, maksimal 300 kata."
        )

        # Inject User Memory if present
        if user_id:
            try:
                from services.ai.context.memory import get_user_memories, format_memories_for_prompt
                memories = await get_user_memories(self.db, user_id)
                memory_str = format_memories_for_prompt(memories)
                if memory_str:
                    system_instruction += f"\n\n{memory_str}"
            except Exception as mem_err:
                logger.error(f"Error loading user memory in synthesis: {mem_err}")

        prompt = [
            {
                "role": "system",
                "content": system_instruction,
            },
            {
                "role": "user",
                "content": f"Pertanyaan: {question}\n\nKonteks Dokumen:\n{context}\n\nSintesis temuan:"
            }
        ]

        try:
            response = await chat_adapter.generate_response(
                messages=prompt,
                model=chat_model,
                temperature=0.2,
                max_tokens=600,
            )
            response = response.strip()
            await self._log_llm_usage(workspace_id, chat_adapter_name, chat_model, prompt, response)
            return response
        except Exception as e:
            logger.warning(f"Synthesis failed: {e}")
            return f"Gagal mensintesis informasi: {str(e)}"

    async def _generate_followup_questions(
        self,
        original_query: str,
        weak_syntheses: List[Dict],
        chat_adapter,
        chat_model: str,
        workspace_id: str,
        chat_adapter_name: str,
    ) -> List[str]:
        weak_list = "\n".join(f"- {s['question']}" for s in weak_syntheses)
        prompt = [
            {
                "role": "user",
                "content": (
                    f"Query riset utama: '{original_query}'\n\n"
                    f"Pertanyaan berikut tidak mendapat jawaban yang cukup:\n{weak_list}\n\n"
                    "Buat 2 pertanyaan alternatif yang menggunakan kata kunci berbeda "
                    "untuk menemukan informasi yang sama. "
                    "Return HANYA JSON array: [\"pertanyaan 1\", \"pertanyaan 2\"]"
                )
            }
        ]

        try:
            response = await chat_adapter.generate_response(
                messages=prompt,
                model=chat_model,
                temperature=0.5,
                max_tokens=256,
            )
            response = response.strip()
            await self._log_llm_usage(workspace_id, chat_adapter_name, chat_model, prompt, response)
            start = response.find("[")
            end = response.rfind("]") + 1
            if start != -1 and end > start:
                questions = json.loads(response[start:end])
                return [q for q in questions if isinstance(q, str)]
        except Exception as e:
            logger.warning(f"Follow-up question generation failed: {e}")

        return []

    async def _write_final_report(
        self,
        original_query: str,
        syntheses: List[Dict],
        all_sources: List[Dict],
        chat_adapter,
        chat_model: str,
        workspace_id: str,
        chat_adapter_name: str,
        user_id: str = None,
    ) -> str:
        synthesis_text = ""
        for i, s in enumerate(syntheses):
            label = " *(follow-up)*" if s.get("is_followup") else ""
            synthesis_text += f"\n\n### Sub-pertanyaan {i+1}{label}: {s['question']}\n"
            synthesis_text += s["summary"]

        sources_text = ""
        unique_sources = sorted(all_sources, key=lambda x: x.get("relevance", 0), reverse=True)
        for i, src in enumerate(unique_sources[:15]):
            sources_text += f"{i+1}. **{src['filename']}** — Halaman {src['page']}"
            if src.get("relevance"):
                sources_text += f" *(relevansi: {int(src['relevance'] * 100)}%)*"
            sources_text += "\n"

        system_instruction = (
            "Kamu adalah research analyst profesional yang menulis laporan riset. "
            "Buat laporan dalam Bahasa Indonesia yang komprehensif, terstruktur, dan dapat dibaca. "
            "Gunakan format Markdown yang kaya dengan heading, bold, bullet points.\n\n"
            "Struktur laporan yang WAJIB:\n"
            "1. `# [Judul Laporan]`\n"
            "2. `## Executive Summary` — ringkasan 2-3 paragraf\n"
            "3. `## Temuan Utama` — sub-sections per topik utama\n"
            "4. `## Kesimpulan & Rekomendasi` — poin-poin actionable\n"
            "5. `## Daftar Sumber` — referensi dokumen\n\n"
            "Tulis dalam gaya profesional. Sertakan data spesifik jika ada. "
            "Panjang laporan: 600-1000 kata."
        )

        # Inject User Memory if present
        if user_id:
            try:
                from services.ai.context.memory import get_user_memories, format_memories_for_prompt
                memories = await get_user_memories(self.db, user_id)
                memory_str = format_memories_for_prompt(memories)
                if memory_str:
                    system_instruction += f"\n\n{memory_str}"
            except Exception as mem_err:
                logger.error(f"Error loading user memory in report: {mem_err}")

        prompt = [
            {
                "role": "system",
                "content": system_instruction,
            },
            {
                "role": "user",
                "content": (
                    f"**Query Riset:** {original_query}\n\n"
                    f"**Hasil Investigasi:**\n{synthesis_text}\n\n"
                    f"**Dokumen yang Digunakan:**\n{sources_text}\n\n"
                    "Tulis laporan riset final yang komprehensif berdasarkan temuan di atas. "
                    "Masukkan bagian '## Daftar Sumber' di akhir dengan daftar sumber yang sudah disediakan."
                ),
            }
        ]

        try:
            response = await chat_adapter.generate_response(
                messages=prompt,
                model=chat_model,
                temperature=0.3,
                max_tokens=2000,
            )
            report = response.strip()
            await self._log_llm_usage(workspace_id, chat_adapter_name, chat_model, prompt, report)

            if "## Daftar Sumber" not in report and sources_text:
                report += f"\n\n## Daftar Sumber\n\n{sources_text}"

            report += (
                f"\n\n---\n"
                f"*Laporan ini dihasilkan oleh DocuMind AI Deep Research · "
                f"{datetime.now(timezone.utc).strftime('%d %b %Y, %H:%M')} UTC · "
                f"{len(syntheses)} sub-questions · {sum(s['chunks_found'] for s in syntheses)} total chunks*"
            )
            return report
        except Exception as e:
            logger.error(f"Report writing failed: {e}")
            fallback = f"# Laporan Riset: {original_query}\n\n"
            fallback += "## Temuan Berdasarkan Dokumen\n\n"
            for s in syntheses:
                fallback += f"### {s['question']}\n\n{s['summary']}\n\n"
            fallback += f"\n\n## Daftar Sumber\n\n{sources_text}"
            return fallback

    async def _log_llm_usage(self, workspace_id: str, provider: str, model: str, prompt: list, response: str):
        try:
            from services.cost_calculator import log_usage
            await log_usage(
                db=self.db,
                workspace_id=workspace_id,
                provider=provider or "openai",
                model=model,
                operation="research",
                prompt_content=prompt,
                completion_content=response,
            )
        except Exception as e:
            logger.error(f"Failed to log research step: {e}")

    def _evt(self, event: str, data: Dict) -> str:
        payload = {"event": event, **data}
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    def _log(self, log_list: List, step: str, message: str):
        log_list.append({
            "step": step,
            "message": message,
            "ts": datetime.now(timezone.utc).isoformat(),
        })

    async def _update_job(self, job: ResearchJob, status: str, error: Optional[str] = None, progress: Optional[List] = None):
        try:
            job.status = status
            if error:
                job.error_message = error
            if progress:
                job.progress_log = json.dumps(progress, ensure_ascii=False)
            job.completed_at = datetime.now(timezone.utc)
            await self.db.commit()
        except Exception as e:
            logger.error(f"Failed to update job status: {e}")
