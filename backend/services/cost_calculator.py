"""
Cost Calculator Service — DocuMind AI
======================================
Kalkulasi token dan estimasi biaya USD serta logging penggunaan model AI.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from models.usage_log import UsageLog
import tiktoken
import json
import logging

logger = logging.getLogger(__name__)

def count_tokens(text: str, model_name: str = "gpt-4o-mini") -> int:
    """Hitung token dari text menggunakan tiktoken dengan fallback."""
    if not text:
        return 0
    try:
        model_name_lower = model_name.lower()
        if "gpt-4" in model_name_lower or "gpt-3" in model_name_lower or "text-embedding" in model_name_lower:
            try:
                encoding = tiktoken.encoding_for_model(model_name)
            except Exception:
                encoding = tiktoken.get_encoding("cl100k_base")
        else:
            encoding = tiktoken.get_encoding("cl100k_base")
        return len(encoding.encode(text))
    except Exception as e:
        # Fallback: estimasi kasar (4 karakter ≈ 1 token)
        logger.debug(f"Tiktoken failed for model {model_name}, fallback to char count: {e}")
        return max(1, len(text) // 4)


def count_content_tokens(content: str | list | dict | int, model_name: str = "gpt-4o-mini") -> int:
    """Konversi input konten (string, list pesan, atau token count langsung) ke int."""
    if isinstance(content, int):
        return content
    if not content:
        return 0
    if isinstance(content, (list, dict)):
        try:
            serialized = json.dumps(content)
        except Exception:
            serialized = str(content)
        return count_tokens(serialized, model_name)
    return count_tokens(str(content), model_name)


def calculate_cost(provider: str, model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Hitung estimasi biaya pemakaian model LLM dalam USD."""
    provider = provider.lower()
    model = model.lower()

    if provider == "ollama":
        return 0.0

    # Tabel harga per token (Input & Output USD per 1 token)
    rates = {
        "gpt-4o-mini": {"input": 0.15 / 1_000_000, "output": 0.60 / 1_000_000},
        "gpt-4o": {"input": 5.00 / 1_000_000, "output": 15.00 / 1_000_000},
        "claude-3-5-sonnet": {"input": 3.00 / 1_000_000, "output": 15.00 / 1_000_000},
        "claude-3-haiku": {"input": 0.25 / 1_000_000, "output": 1.25 / 1_000_000},
        "claude-3-opus": {"input": 15.00 / 1_000_000, "output": 75.00 / 1_000_000},
    }

    # Cari model rate yang cocok berdasarkan substring
    matched_rate = None
    for key, rate in rates.items():
        if key in model:
            matched_rate = rate
            break

    if not matched_rate:
        # Default rate fallback jika tidak terdaftar
        if "gpt-4" in model or "claude-3-5" in model:
            matched_rate = {"input": 3.00 / 1_000_000, "output": 15.00 / 1_000_000}
        else:
            # Fallback untuk model ringan lainnya
            matched_rate = {"input": 1.00 / 1_000_000, "output": 2.00 / 1_000_000}

    cost = (prompt_tokens * matched_rate["input"]) + (completion_tokens * matched_rate["output"])
    return round(cost, 8)


async def log_usage(
    db: AsyncSession,
    workspace_id: str,
    provider: str,
    model: str,
    operation: str,
    prompt_content: str | list | dict | int,
    completion_content: str | list | dict | int,
    user_id: str = None
) -> UsageLog:
    """Helper untuk menghitung token, biaya, dan menyimpan logs ke SQLite database."""
    p_tokens = count_content_tokens(prompt_content, model)
    c_tokens = count_content_tokens(completion_content, model)
    t_tokens = p_tokens + c_tokens

    cost = calculate_cost(provider, model, p_tokens, c_tokens)

    if not user_id and workspace_id:
        try:
            from models.workspace import Workspace
            ws = await db.get(Workspace, workspace_id)
            if ws:
                user_id = ws.owner_id
        except Exception as e:
            logger.warning(f"Could not resolve owner_id from workspace: {e}")

    log_record = UsageLog(
        workspace_id=workspace_id,
        user_id=user_id,
        provider=provider,
        model=model,
        operation=operation,
        prompt_tokens=p_tokens,
        completion_tokens=c_tokens,
        total_tokens=t_tokens,
        estimated_cost_usd=cost
    )

    db.add(log_record)
    try:
        await db.commit()
        await db.refresh(log_record)
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to save usage log: {e}")

    return log_record
