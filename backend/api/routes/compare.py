"""
Compare Routes — DocuMind AI
=============================
Endpoint untuk pengujian tanding model (side-by-side) dan voting performa model.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import asyncio
import json
import logging
from typing import List
from services.ai.registry import ModelRegistry
from models import UserAPIKey
from core.security import decrypt_api_key
from services.ai.providers import get_provider_adapter

from core.database import get_db
from models import Workspace, ModelCompareVote
from api.deps import get_user_workspace

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/compare", tags=["Compare"])


class CompareRequest(BaseModel):
    query: str
    model_a: str
    model_b: str


class VoteRequest(BaseModel):
    query_text: str
    model_a: str
    model_b: str
    response_a: str
    response_b: str
    vote: str  # "model_a" | "model_b" | "tie"


async def get_model_adapter(db: AsyncSession, owner_id: str, model_name: str):
    """Mencari API key yang sesuai dan membuat adapter provider LLM."""
    models = await ModelRegistry.get_models(owner_id, db)
    provider = None
    for m in models:
        if m.id == model_name:
            provider = m.provider
            break

    if not provider:
        # Fallback to string matching
        model_name_lower = model_name.lower()
        if "gpt" in model_name_lower:
            provider = "openai"
        elif "claude" in model_name_lower:
            provider = "anthropic"
        elif "gemini" in model_name_lower:
            provider = "gemini"
        elif "ollama" in model_name_lower or "llama" in model_name_lower:
            provider = "ollama"
        else:
            provider = "openrouter"

    if provider == "ollama":
        return get_provider_adapter("ollama", "http://localhost:11434"), provider

    result = await db.execute(
        select(UserAPIKey).where(
            UserAPIKey.user_id == owner_id,
            UserAPIKey.provider == provider
        )
    )
    key_record = result.scalars().first()
    if not key_record:
        if provider == "openai":
            raise ValueError("API key OpenAI belum dikonfigurasi.")
        raise ValueError(f"API key untuk provider '{provider}' tidak ditemukan di settings.")

    api_key = decrypt_api_key(key_record.encrypted_key)
    return get_provider_adapter(provider, api_key), provider


async def stream_model(
    model_tag: str,
    adapter,
    model_name: str,
    query: str,
    queue: asyncio.Queue
):
    """Task independen untuk men-stream satu model dan mengirim hasilnya ke queue."""
    start_time = asyncio.get_event_loop().time()
    ttft = None
    accumulated = ""
    prompt = [{"role": "user", "content": query}]

    try:
        response_stream = adapter.stream_response(
            messages=prompt,
            model=model_name,
            temperature=0.7,
            max_tokens=1500,
        )

        async for chunk in response_stream:
            if ttft is None:
                ttft = int((asyncio.get_event_loop().time() - start_time) * 1000)
                await queue.put({"event": f"ttft_{model_tag}", "data": {"ttft_ms": ttft}})

            accumulated += chunk
            await queue.put({"event": model_tag, "data": {"text": chunk}})

        await queue.put({
            "event": f"done_{model_tag}",
            "data": {
                "text": accumulated,
                "ttft_ms": ttft or int((asyncio.get_event_loop().time() - start_time) * 1000)
            }
        })

    except Exception as e:
        logger.error(f"Error streaming {model_name}: {e}")
        await queue.put({"event": f"error_{model_tag}", "data": {"message": str(e)}})


@router.post("/{workspace_id}")
async def compare_models(
    request: CompareRequest,
    workspace: Workspace = Depends(get_user_workspace),
    db: AsyncSession = Depends(get_db)
):
    """
    Jalankan query ke 2 model secara paralel dan stream response side-by-side.
    """
    try:
        adapter_a, provider_a = await get_model_adapter(db, workspace.owner_id, request.model_a)
        adapter_b, provider_b = await get_model_adapter(db, workspace.owner_id, request.model_b)
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))

    queue = asyncio.Queue()

    # Launch streaming tasks in background
    asyncio.create_task(stream_model("model_a", adapter_a, request.model_a, request.query, queue))
    asyncio.create_task(stream_model("model_b", adapter_b, request.model_b, request.query, queue))

    async def event_generator():
        done_count = 0
        response_a = ""
        response_b = ""

        while done_count < 2:
            try:
                msg = await queue.get()
                event = msg["event"]
                data = msg["data"]

                yield f"data: {json.dumps({'event': event, 'data': data}, ensure_ascii=False)}\n\n"

                if event == "done_model_a":
                    done_count += 1
                    response_a = data["text"]
                elif event == "done_model_b":
                    done_count += 1
                    response_b = data["text"]
                elif event == "error_model_a" or event == "error_model_b":
                    done_count += 1

            except Exception as e:
                yield f"data: {json.dumps({'event': 'error', 'message': str(e)})}\n\n"
                break

        # Log usage to DB at the end
        try:
            from services.cost_calculator import log_usage
            if response_a:
                await log_usage(
                    db=db,
                    workspace_id=workspace.id,
                    provider=provider_a,
                    model=request.model_a,
                    operation="compare",
                    prompt_content=request.query,
                    completion_content=response_a
                )
            if response_b:
                await log_usage(
                    db=db,
                    workspace_id=workspace.id,
                    provider=provider_b,
                    model=request.model_b,
                    operation="compare",
                    prompt_content=request.query,
                    completion_content=response_b
                )
        except Exception as log_err:
            logger.error(f"Failed to log usage in compare route: {log_err}")

        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/{workspace_id}/vote")
async def vote_model_compare(
    payload: VoteRequest,
    workspace: Workspace = Depends(get_user_workspace),
    db: AsyncSession = Depends(get_db)
):
    """
    Simpan hasil pilihan (vote) dari perbandingan model ke database.
    """
    vote_record = ModelCompareVote(
        workspace_id=workspace.id,
        query_text=payload.query_text,
        model_a=payload.model_a,
        model_b=payload.model_b,
        response_a=payload.response_a,
        response_b=payload.response_b,
        vote=payload.vote
    )
    db.add(vote_record)
    await db.commit()
    await db.refresh(vote_record)

    return {"status": "ok", "vote_id": vote_record.id}


@router.get("/{workspace_id}/votes")
async def list_model_compare_votes(
    workspace: Workspace = Depends(get_user_workspace),
    db: AsyncSession = Depends(get_db)
):
    """
    Ambil seluruh riwayat voting perbandingan model di workspace ini.
    """
    result = await db.execute(
        select(ModelCompareVote)
        .where(ModelCompareVote.workspace_id == workspace.id)
        .order_by(ModelCompareVote.created_at.desc())
    )
    votes = result.scalars().all()

    return {
        "votes": [
            {
                "id": v.id,
                "query_text": v.query_text,
                "model_a": v.model_a,
                "model_b": v.model_b,
                "response_a": v.response_a,
                "response_b": v.response_b,
                "vote": v.vote,
                "created_at": v.created_at.isoformat() if v.created_at else None
            }
            for v in votes
        ]
    }
