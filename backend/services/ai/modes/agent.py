import json
import logging
import time
import traceback
from datetime import datetime, timezone
from typing import AsyncIterator, List, Dict, Any, Optional
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from models import Workspace, Document, AgentTrace, Conversation, Message
from services.ai.base import BaseReasoningMode
from services.ai.gateway import LLMGateway
from services.ai.context.manager import ContextManager
from services.ai.tools import get_default_registry
from services.ai.postprocess.streaming import format_sse_event, format_llm_error_message

logger = logging.getLogger(__name__)

class AgentMode(BaseReasoningMode):
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
        max_iterations: int = 8,
    ) -> AsyncIterator[str]:
        # 1. Retrieve workspace
        workspace = await self.db.get(Workspace, workspace_id)
        if not workspace:
            yield f"data: {json.dumps({'event': 'error', 'message': 'Workspace tidak ditemukan'})}\n\n"
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
            yield f"data: {json.dumps({'event': 'error', 'message': f'Provider error: {str(e)}'})}\n\n"
            yield "data: [DONE]\n\n"
            return

        # 3. Initialize Tool Registry and Executor
        tool_registry = get_default_registry()

        # 4. Save trace record
        trace = AgentTrace(
            workspace_id=workspace_id,
            user_query=query,
            status="running",
        )
        self.db.add(trace)
        await self.db.commit()
        await self.db.refresh(trace)

        if not conversation_id:
            title = query[:40] + "..." if len(query) > 40 else query
            conversation = Conversation(workspace_id=workspace_id, title=title)
            self.db.add(conversation)
            await self.db.commit()
            conversation_id = conversation.id
        
        # Save user message
        user_msg = Message(
            conversation_id=conversation_id,
            role="user",
            content=query,
        )
        self.db.add(user_msg)
        await self.db.commit()

        # 5. Build System Prompt & Messages
        system_prompt = (
            "Kamu adalah DocuMind AI Agent, asisten dokumen cerdas yang dapat mencari "
            "dan menganalisis dokumen secara mendalam.\n\n"
            "Kamu memiliki akses ke tools berikut untuk mencari informasi di dokumen:\n"
            "- search_documents: untuk semantic search berdasarkan topik\n"
            "- list_documents: untuk melihat semua dokumen yang tersedia\n"
            "- get_document_metadata: untuk detail metadata dokumen\n"
            "- get_document_content: untuk membaca konten halaman spesifik\n"
            "- semantic_search: untuk search dengan filter tipe dokumen\n\n"
            "PANDUAN:\n"
            "1. Gunakan tools secara strategis — jangan search hal yang sama dua kali\n"
            "2. Mulai dengan list_documents jika tidak tahu dokumen apa yang tersedia\n"
            "3. Gunakan beberapa search queries berbeda untuk topik yang kompleks\n"
            "4. Sertakan citation [dokumen, halaman] di jawaban final\n"
            "5. Jika informasi tidak ditemukan setelah pencarian menyeluruh, katakan dengan jelas\n"
            "6. Jawab dalam bahasa yang sama dengan pertanyaan pengguna\n\n"
            "ATURAN FORMATTING (WAJIB DIIKUTI):\n"
            "1. Gunakan format Markdown secara ekstensif agar jawaban mudah dibaca.\n"
            "2. JIKA pengguna meminta perbandingan, atau jika data mengandung struktur kolom/baris, WAJIB tampilkan jawaban dalam format Markdown Table.\n"
            "3. JIKA memberikan contoh skrip, konfigurasi, atau data mentah, gunakan Markdown Code Blocks (```language ... ```).\n"
            "4. Gunakan bullet points atau daftar bernomor jika menjelaskan langkah-langkah atau beberapa poin."
        )

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

        # 6. Execution Loop
        steps_log = []
        iteration = 0
        final_answer = ""
        status = "done"

        yield f"data: {json.dumps({'event': 'start', 'trace_id': trace.id, 'query': query, 'conversation_id': conversation_id})}\n\n"

        while iteration < max_iterations:
            iteration += 1
            step_start = time.monotonic()

            yield f"data: {json.dumps({'event': 'thinking', 'step': iteration, 'max_steps': max_iterations})}\n\n"

            # Call LLM with tool support
            try:
                llm_response = await self._call_llm_with_tools(
                    default_chat_endpoint_id=chat_adapter,
                    chat_model=chat_model,
                    messages=messages,
                    tools=tool_registry.get_schemas(),
                    temperature=0.1,
                )
            except Exception as e:
                logger.error(f"LLM call failed at iteration {iteration}: {e}")
                yield f"data: {json.dumps({'event': 'error', 'message': f'LLM error: {str(e)}'})}\n\n"
                status = "error"
                break

            step_latency = int((time.monotonic() - step_start) * 1000)
            response_type = llm_response.get("type")

            # Log Usage
            try:
                from services.cost_calculator import log_usage
                response_content = (
                    json.dumps(llm_response.get("tool_calls"))
                    if response_type == "tool_call"
                    else llm_response.get("content", "")
                )
                await log_usage(
                    db=self.db,
                    workspace_id=workspace.id,
                    provider=endpoint_name or "openai",
                    model=chat_model,
                    operation="agent",
                    prompt_content=messages,
                    completion_content=response_content,
                )
            except Exception as usage_err:
                logger.error(f"Failed to log agent iteration usage: {usage_err}")

            if response_type == "tool_call":
                tool_calls = llm_response.get("tool_calls", [])

                for tc in tool_calls:
                    tool_name = tc.get("name", "")
                    tool_args = tc.get("args", {})
                    tool_call_id = tc.get("id", f"call_{iteration}")

                    yield f"data: {json.dumps({'event': 'tool_call', 'step': iteration, 'tool': tool_name, 'args': tool_args})}\n\n"

                    # Execute tool via ToolRegistry
                    tool_exec_start = time.monotonic()
                    tool_result = await tool_registry.execute(
                        tool_name,
                        **tool_args,
                        db=self.db,
                        workspace=workspace,
                        embedding_provider=embedding_provider,
                        embed_model=embed_model,
                    )
                    tool_latency = int((time.monotonic() - tool_exec_start) * 1000)

                    yield f"data: {json.dumps({'event': 'tool_result', 'step': iteration, 'tool': tool_name, 'result': tool_result, 'latency_ms': tool_latency})}\n\n"

                    # Log Step
                    steps_log.append({
                        "step": iteration,
                        "type": "tool_call",
                        "tool_name": tool_name,
                        "tool_args": tool_args,
                        "tool_result": tool_result,
                        "latency_ms": step_latency + tool_latency,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    })

                    # Append to messages for context
                    messages.append({
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [{
                            "id": tool_call_id,
                            "type": "function",
                            "function": {
                                "name": tool_name,
                                "arguments": json.dumps(tool_args)
                            }
                        }]
                    })
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call_id,
                        "content": json.dumps(tool_result, ensure_ascii=False)
                    })

            elif response_type == "final_answer":
                final_answer = llm_response.get("content", "")

                steps_log.append({
                    "step": iteration,
                    "type": "final_answer",
                    "content": final_answer[:200] + "..." if len(final_answer) > 200 else final_answer,
                    "latency_ms": step_latency,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })

                yield f"data: {json.dumps({'event': 'answer_start', 'step': iteration})}\n\n"

                chunk_size = 30
                for i in range(0, len(final_answer), chunk_size):
                    chunk = final_answer[i:i + chunk_size]
                    yield f"data: {json.dumps({'event': 'answer', 'text': chunk})}\n\n"

                break
            else:
                logger.warning(f"Unexpected LLM response type at iteration {iteration}: {response_type}")
                status = "error"
                break
        else:
            status = "max_iterations_reached"
            yield f"data: {json.dumps({'event': 'max_iterations', 'message': f'Batas maksimum {max_iterations} langkah tercapai.'})}\n\n"

        # Update trace record
        try:
            trace.steps = json.dumps(steps_log, ensure_ascii=False)
            trace.final_answer = final_answer
            trace.total_iterations = iteration
            trace.status = status
            trace.completed_at = datetime.now(timezone.utc)
            
            # Save assistant message
            if final_answer:
                ai_msg = Message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=final_answer,
                    provider=endpoint_name,
                    model=chat_model,
                    metadata_json={"trace_id": trace.id}
                )
                self.db.add(ai_msg)
                
            await self.db.commit()
        except Exception as e:
            logger.error(f"Failed to save agent trace: {e}")

        yield f"data: {json.dumps({'event': 'done', 'total_steps': iteration, 'trace_id': trace.id, 'status': status})}\n\n"
        yield "data: [DONE]\n\n"

    async def _call_llm_with_tools(
        self,
        default_chat_endpoint_id,
        chat_model: str,
        messages: List[Dict],
        tools: List[Dict],
        temperature: float = 0.1,
    ) -> Dict:
        import litellm
        try:
            custom_llm_provider = "openai"
            if "anthropic.com" in default_chat_endpoint_id.base_url: custom_llm_provider = "anthropic"
            elif "gemini" in default_chat_endpoint_id.base_url or "googleapis" in default_chat_endpoint_id.base_url: custom_llm_provider = "gemini"

            response = await litellm.acompletion(
                model=f"{custom_llm_provider}/{chat_model}" if custom_llm_provider != "openai" else chat_model,
                messages=messages,
                tools=tools,
                tool_choice="auto",
                api_key=default_chat_endpoint_id.api_key,
                api_base=default_chat_endpoint_id.base_url,
                temperature=temperature,
                max_tokens=2048,
                custom_llm_provider=custom_llm_provider,
            )
            
            message = response.choices[0].message
            if getattr(message, "tool_calls", None):
                tool_calls = []
                for tc in message.tool_calls:
                    tool_calls.append({
                        "id": tc.id,
                        "name": tc.function.name,
                        "args": json.loads(tc.function.arguments),
                    })
                return {"type": "tool_call", "tool_calls": tool_calls}
            else:
                return {"type": "final_answer", "content": message.content}
        except Exception as e:
            # Fallback to ReAct if tool calling fails (e.g. unsupported model)
            return await self._call_llm_react_fallback(default_chat_endpoint_id, chat_model, messages, tools, temperature)

    async def _call_llm_react_fallback(
        self,
        default_chat_endpoint_id,
        chat_model: str,
        messages: List[Dict],
        tools: List[Dict],
        temperature: float,
    ) -> Dict:
        tool_desc = []
        for tool in tools:
            fn = tool["function"]
            params = fn.get("parameters", {}).get("properties", {})
            param_list = ", ".join(
                f"{k} ({v.get('type', 'string')})" for k, v in params.items()
            )
            tool_desc.append(f"- {fn['name']}({param_list}): {fn['description']}")

        react_system = (
            "Kamu adalah AI agent yang menggunakan tools untuk menjawab pertanyaan.\n\n"
            "Tools yang tersedia:\n" + "\n".join(tool_desc) + "\n\n"
            "Format WAJIB untuk memanggil tool:\n"
            "```json\n{\"tool\": \"nama_tool\", \"args\": {\"param\": \"value\"}}\n```\n\n"
            "Format WAJIB untuk jawaban final (ketika sudah cukup informasi):\n"
            "```json\n{\"final_answer\": \"jawaban lengkap kamu di sini\"}\n```\n\n"
            "PENTING: Hanya output satu JSON per response. Jangan tambahkan teks lain."
        )

        react_messages = [{"role": "system", "content": react_system}]

        for msg in messages:
            if msg.get("role") == "system":
                continue
            elif msg.get("role") == "tool":
                react_messages.append({
                    "role": "user",
                    "content": f"Tool result: {msg.get('content', '')}"
                })
            elif msg.get("role") in ("user", "assistant") and msg.get("content"):
                react_messages.append({"role": msg["role"], "content": msg["content"]})

        try:
            response = await default_chat_endpoint_id.generate_response(
                messages=react_messages,
                model=chat_model,
                temperature=temperature,
                max_tokens=512,
            )

            response = response.strip()
            if "```json" in response:
                start = response.index("```json") + 7
                end = response.index("```", start)
                response = response[start:end].strip()
            elif "```" in response:
                start = response.index("```") + 3
                end = response.rindex("```")
                response = response[start:end].strip()

            parsed = json.loads(response)

            if "final_answer" in parsed:
                return {"type": "final_answer", "content": parsed["final_answer"]}
            elif "tool" in parsed:
                return {
                    "type": "tool_call",
                    "tool_calls": [{
                        "id": "react_call",
                        "name": parsed["tool"],
                        "args": parsed.get("args", {})
                    }]
                }
            else:
                return {"type": "final_answer", "content": response}

        except Exception as e:
            logger.error(f"ReAct fallback error: {e}")
            return {"type": "final_answer", "content": format_llm_error_message(e)}
