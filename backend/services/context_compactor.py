"""
Context Compactor — DocuMind AI
================================
Kompres conversation history yang panjang secara dinamis menggunakan LLM.
Menggantikan pendekatan hardcode `history[-5:]` dengan manajemen token yang cerdas.

Strategi:
  1. Estimasi token dari seluruh conversation history (4 karakter ≈ 1 token)
  2. Jika total token melebihi threshold, pisahkan history menjadi:
     - "Bagian lama" (semua kecuali N pesan terakhir)
     - "Pesan terbaru" (N pesan terakhir yang selalu dipertahankan utuh)
  3. Kirim bagian lama ke LLM untuk diringkas menjadi satu "summary message"
  4. Return: [summary_message] + recent_messages
"""

import logging
from typing import List, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from providers.base import ILLMProvider

logger = logging.getLogger(__name__)

# Jumlah pesan terbaru yang selalu dipertahankan tanpa kompresi
RECENT_MESSAGES_TO_KEEP = 4

# Estimasi sederhana: 4 karakter ≈ 1 token (cukup akurat untuk Bahasa Inggris/Indonesia)
CHARS_PER_TOKEN = 4


def _estimate_tokens(messages: List[Dict[str, str]]) -> int:
    """Estimasi jumlah token dari daftar pesan."""
    total_chars = sum(
        len(m.get("content", "")) for m in messages if isinstance(m.get("content"), str)
    )
    return total_chars // CHARS_PER_TOKEN


async def compact_context(
    conversation_history: List[Dict[str, str]],
    chat_provider: ILLMProvider,
    model: str,
    max_context_tokens: int = 4000,
    temperature: float = 0.1,
    db: AsyncSession = None,
    workspace_id: str = None,
) -> List[Dict[str, str]]:
    """
    Kompres conversation history jika melebihi `max_context_tokens`.

    Args:
        conversation_history: Riwayat percakapan dalam format [{role, content}, ...]
        chat_provider: Provider LLM untuk melakukan kompresi
        model: Nama model yang digunakan untuk kompresi
        max_context_tokens: Batas token sebelum kompresi dilakukan
        temperature: Temperature untuk LLM saat meringkas (rendah = deterministik)
        db: Database session (opsional)
        workspace_id: ID workspace (opsional)

    Returns:
        Conversation history yang sudah dioptimasi.
        Jika tidak perlu kompresi, return history asli.
    """
    if not conversation_history:
        return []

    estimated_tokens = _estimate_tokens(conversation_history)

    # Tidak perlu kompresi
    if estimated_tokens <= max_context_tokens:
        return conversation_history

    # Tidak cukup pesan untuk dikompresi (butuh minimal RECENT + beberapa pesan lama)
    if len(conversation_history) <= RECENT_MESSAGES_TO_KEEP + 1:
        return conversation_history

    logger.info(
        f"Context compaction triggered: ~{estimated_tokens} tokens > {max_context_tokens} threshold. "
        f"History length: {len(conversation_history)} messages."
    )

    # Pisahkan menjadi bagian lama dan pesan terbaru
    recent_messages = conversation_history[-RECENT_MESSAGES_TO_KEEP:]
    older_messages = conversation_history[:-RECENT_MESSAGES_TO_KEEP]

    # Susun teks percakapan lama untuk diringkas
    conversation_text = "\n".join(
        f"{msg['role'].upper()}: {msg.get('content', '')}"
        for msg in older_messages
        if msg.get("role") in ("user", "assistant") and msg.get("content")
    )

    if not conversation_text.strip():
        # Tidak ada konten yang bisa diringkas
        return recent_messages

    summary_prompt = [
        {
            "role": "user",
            "content": (
                "Berikut adalah percakapan sebelumnya antara user dan AI assistant. "
                "Buat ringkasan singkat dan padat (maksimal 300 kata) yang mencakup:\n"
                "- Topik utama yang dibahas\n"
                "- Keputusan atau kesimpulan penting\n"
                "- Konteks yang mungkin relevan untuk percakapan selanjutnya\n\n"
                "Tulis ringkasan dalam format narasi, bukan bullet point.\n\n"
                f"PERCAKAPAN:\n{conversation_text}\n\n"
                "RINGKASAN:"
            ),
        }
    ]

    try:
        summary_text = await chat_provider.generate_response(
            messages=summary_prompt,
            model=model,
            temperature=temperature,
            max_tokens=512,
        )

        # Log usage
        if db and workspace_id:
            try:
                from services.cost_calculator import log_usage
                provider_name = "openai" if "gpt" in model.lower() else ("anthropic" if "claude" in model.lower() else "ollama")
                await log_usage(
                    db=db,
                    workspace_id=workspace_id,
                    provider=provider_name,
                    model=model,
                    operation="compaction",
                    prompt_content=summary_prompt,
                    completion_content=summary_text,
                )
            except Exception as usage_err:
                logger.error(f"Failed to log context compaction usage: {usage_err}")

        summary_message = {
            "role": "system",
            "content": (
                f"[Ringkasan percakapan sebelumnya]\n{summary_text.strip()}\n"
                "[Akhir ringkasan — percakapan berlanjut di bawah]"
            ),
        }

        compacted = [summary_message] + recent_messages
        new_estimate = _estimate_tokens(compacted)

        logger.info(
            f"Context compaction complete: {estimated_tokens} → ~{new_estimate} tokens "
            f"({len(older_messages)} messages → 1 summary)"
        )

        return compacted

    except Exception as e:
        # Jika kompresi gagal, fallback ke N pesan terbaru saja
        logger.warning(
            f"Context compaction failed: {e}. Falling back to last {RECENT_MESSAGES_TO_KEEP} messages."
        )
        return recent_messages
