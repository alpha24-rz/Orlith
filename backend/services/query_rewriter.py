"""
Query Rewriter — DocuMind AI
==============================
Memperbaiki dan memperluas query pengguna sebelum dilakukan embedding search,
sehingga hasil retrieval dari ChromaDB menjadi jauh lebih relevan.

Strategi:
  1. Kirim query asli ke LLM dengan prompt khusus
  2. LLM menghasilkan 2-3 variasi query yang lebih semantik dan komprehensif
  3. Embed semua variasi, gabungkan hasil search (union + dedup by distance)
  4. Return query yang sudah dioptimasi atau daftar variasi untuk multi-query search

Contoh:
  Input:  "berapa cuti tahunan?"
  Output: ["annual leave entitlement days per year policy",
           "employee paid time off annual days",
           "yearly vacation allowance company policy"]
"""

import logging
import json
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from providers.base import ILLMProvider

logger = logging.getLogger(__name__)


async def rewrite_query(
    original_query: str,
    chat_provider: ILLMProvider,
    model: str,
    num_variants: int = 3,
    db: AsyncSession = None,
    workspace_id: str = None,
) -> List[str]:
    """
    Hasilkan variasi query yang lebih semantik untuk meningkatkan retrieval quality.

    Args:
        original_query: Query asli dari pengguna
        chat_provider: Provider LLM
        model: Nama model
        num_variants: Jumlah variasi query yang dihasilkan
        db: Database session (opsional)
        workspace_id: ID workspace (opsional)

    Returns:
        List berisi query asli + variasi-variasi yang dihasilkan.
        Jika rewriting gagal, return [original_query] saja (graceful degradation).
    """
    if not original_query or not original_query.strip():
        return [original_query]

    # Query sangat pendek (< 3 kata) — rewrite bisa lebih merugikan
    word_count = len(original_query.strip().split())
    if word_count >= 15:
        # Query sudah cukup panjang dan spesifik, tidak perlu rewrite
        return [original_query]

    prompt = [
        {
            "role": "system",
            "content": (
                "Kamu adalah query optimization assistant untuk sistem pencarian dokumen. "
                "Tugasmu adalah mengubah query pengguna menjadi variasi-variasi yang lebih "
                "baik untuk semantic search. Fokus pada makna, sinonim, dan istilah teknis "
                "yang mungkin muncul dalam dokumen profesional/bisnis.\n\n"
                "PENTING: Return HANYA JSON array berisi string, tanpa penjelasan tambahan.\n"
                "Format: [\"variasi 1\", \"variasi 2\", \"variasi 3\"]"
            ),
        },
        {
            "role": "user",
            "content": (
                f"Query asli: \"{original_query}\"\n\n"
                f"Buat {num_variants} variasi query dalam Bahasa Inggris yang:\n"
                "1. Menggunakan istilah teknis/profesional yang relevan\n"
                "2. Mencakup sinonim dan frasa alternatif\n"
                "3. Berfokus pada konsep inti, bukan gaya bahasa\n\n"
                "Contoh:\n"
                "- Query: \"berapa cuti tahunan?\"\n"
                "- Output: [\"annual leave entitlement days policy\", "
                "\"employee paid time off per year\", "
                "\"yearly vacation allowance company rules\"]\n\n"
                "Sekarang buat variasi untuk query di atas:"
            ),
        },
    ]

    try:
        response = await chat_provider.generate_response(
            messages=prompt,
            model=model,
            temperature=0.3,
            max_tokens=256,
        )
        response = response.strip()

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
                    operation="rewrite",
                    prompt_content=prompt,
                    completion_content=response,
                )
            except Exception as usage_err:
                logger.error(f"Failed to log query rewrite usage: {usage_err}")


        # Coba parse JSON
        # Bersihkan markdown code block jika ada
        if response.startswith("```"):
            lines = response.split("\n")
            response = "\n".join(
                line for line in lines if not line.startswith("```")
            ).strip()

        variants = json.loads(response)

        if isinstance(variants, list) and all(isinstance(v, str) for v in variants):
            # Gabungkan: query asli selalu ada di posisi pertama
            all_queries = [original_query] + [v for v in variants if v != original_query]
            logger.info(
                f"Query rewriting successful: '{original_query}' → {len(all_queries)} variants"
            )
            return all_queries[:num_variants + 1]  # original + max num_variants

    except (json.JSONDecodeError, Exception) as e:
        logger.warning(f"Query rewriting failed for '{original_query}': {e}. Using original query.")

    return [original_query]


async def rewrite_query_simple(
    original_query: str,
    chat_provider: ILLMProvider,
    model: str,
) -> str:
    """
    Versi sederhana: hasilkan SATU query yang lebih baik (bukan multi-query).
    Lebih cepat, cocok untuk use case yang tidak mendukung multi-embedding.

    Returns:
        Satu query string yang sudah dioptimasi, atau query asli jika gagal.
    """
    variants = await rewrite_query(original_query, chat_provider, model, num_variants=1)
    # Gunakan variant pertama jika ada (bukan original), otherwise original
    if len(variants) > 1:
        return variants[1]  # variants[0] = original, variants[1] = first rewrite
    return original_query
