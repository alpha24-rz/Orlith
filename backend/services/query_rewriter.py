from __future__ import annotations
import logging
import json
import re
from typing import List, Optional, Any, TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession
    from services.ai.providers.base import ILLMProvider

logger = logging.getLogger(__name__)


def extract_search_keywords(text: str) -> List[str]:
    """
    Extract high-value tokens (quoted phrases, acronyms, numbers, legal codes)
    to boost BM25 lexical matching.
    """
    if not text:
        return []

    keywords = set()
    # 1. Quoted terms: "cuti tahunan", "pasal 5"
    quotes = re.findall(r'["\']([^"\']+)["\']', text)
    for q in quotes:
        clean_q = q.strip()
        if len(clean_q) > 2:
            keywords.add(clean_q)

    # 2. Codes, laws, article patterns: e.g. "UU No. 13", "Pasal 5", "ISO 27001", "v1.2"
    codes = re.findall(r'\b(?:UU|PP|PERMEN|KEPMEN|PASAL|BAB|ISO|SOP|SK|NO|NOMOR)\s*[A-Z0-9.\-\/]+', text, re.IGNORECASE)
    for c in codes:
        keywords.add(c.strip())

    # 3. Uppercase abbreviations (>=2 chars): PT, CV, KPI, SLA, PPN, PPH, HR, AI
    abbrevs = re.findall(r'\b[A-Z]{2,6}\b', text)
    for a in abbrevs:
        keywords.add(a)

    return list(keywords)


def is_indonesian_query(query: str) -> bool:
    """Heuristic check for common Indonesian particles/words."""
    id_markers = {
        "yang", "di", "ke", "dari", "ini", "itu", "dan", "atau", "untuk",
        "dengan", "pada", "adalah", "apakah", "bagaimana", "berapa", "kapan",
        "dimana", "siapa", "mengapa", "kenapa", "tidak", "ada", "bisa",
        "harus", "syarat", "ketentuan", "aturan", "dokumen", "pasal", "kebijakan"
    }
    words = re.findall(r'\b[a-zA-Z]+\b', query.lower())
    if not words:
        return True
    match_count = sum(1 for w in words if w in id_markers)
    return (match_count / len(words)) >= 0.15 or any(w in id_markers for w in words)


async def rewrite_query(
    original_query: str,
    chat_provider: ILLMProvider,
    model: str,
    num_variants: int = 3,
    db: AsyncSession = None,
    workspace_id: str = None,
) -> List[str]:
    """
    Hasilkan variasi query multilingual yang semantik untuk meningkatkan retrieval quality.
    Mempertahankan bahasa asli query (Bahasa Indonesia / English) dan menyertakan sinonim profesional.
    """
    if not original_query or not original_query.strip():
        return [original_query]

    word_count = len(original_query.strip().split())
    if word_count >= 20:
        return [original_query]

    is_id = is_indonesian_query(original_query)
    lang_instruction = (
        "Gunakan BAHASA INDONESIA formal/profesional untuk semua variasi."
        if is_id
        else "Keep all variations in English using standard professional/business terminology."
    )

    prompt = [
        {
            "role": "system",
            "content": (
                "Kamu adalah AI Retrieval Specialist untuk sistem pencarian dokumen perusahaan. "
                "Tugasmu adalah mereformulasi query pengguna menjadi variasi pencarian yang mencakup "
                "istilah teknis, regulasi, kata kunci resmi, dan sinonim relevan.\n\n"
                f"{lang_instruction}\n"
                "PENTING: Kembalikan HANYA format JSON array string tanpa penjelasan tambahan.\n"
                "Contoh: [\"variasi 1\", \"variasi 2\", \"variasi 3\"]"
            ),
        },
        {
            "role": "user",
            "content": (
                f"Query asli: \"{original_query}\"\n\n"
                f"Buat {num_variants} variasi query pencarian yang:\n"
                "1. Mempertahankan maksud inti dan bahasa utama query pengguna\n"
                "2. Menggunakan istilah formal/profesional yang umum tertulis dalam dokumen resmi/perusahaan\n"
                "3. Mengganti kata informal dengan sinonim baku (misal: 'cuti melahirkan' -> 'cuti bersalin maternity leave')"
            ),
        },
    ]

    try:
        from services.ai.providers.gemini import InteractionsGeminiProvider
        response_format = None
        if isinstance(chat_provider, InteractionsGeminiProvider):
            response_format = {
                "type": "text",
                "mime_type": "application/json",
                "schema": {
                    "type": "object",
                    "properties": {
                        "queries": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "List of search query variations for RAG retrieval."
                        }
                    },
                    "required": ["queries"]
                }
            }

        response = await chat_provider.generate_response(
            messages=prompt,
            model=model,
            temperature=0.2,
            max_tokens=256,
            response_format=response_format,
        )
        response = response.strip()

        # Log usage if available
        if db and workspace_id:
            try:
                from services.cost_calculator import log_usage
                provider_name = (
                    "openai" if "gpt" in model.lower()
                    else ("anthropic" if "claude" in model.lower()
                    else ("gemini" if "gemini" in model.lower() else "ollama"))
                )
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

        # Parse JSON
        if response.startswith("```"):
            lines = response.split("\n")
            response = "\n".join(
                line for line in lines if not line.startswith("```")
            ).strip()

        variants = json.loads(response)
        if isinstance(variants, dict) and "queries" in variants:
            variants = variants["queries"]

        if isinstance(variants, list) and all(isinstance(v, str) for v in variants):
            all_queries = [original_query] + [v.strip() for v in variants if v.strip() and v.strip() != original_query]
            logger.info(
                f"Query rewriting successful: '{original_query}' → {len(all_queries)} variants"
            )
            return all_queries[:num_variants + 1]

    except Exception as e:
        logger.warning(f"Query rewriting failed for '{original_query}': {e}. Using original query.")

    return [original_query]


async def generate_hyde_passage(
    query: str,
    chat_provider: ILLMProvider,
    model: str,
    db: AsyncSession = None,
    workspace_id: str = None,
) -> Optional[str]:
    """
    Hypothetical Document Embeddings (HyDE):
    Generates a concise hypothetical excerpt (2-3 sentences) answering the query.
    Embedding this hypothetical passage bridges the semantic gap between questions and document answers.
    """
    if not query or len(query.strip().split()) < 3:
        return None

    is_id = is_indonesian_query(query)
    lang = "Bahasa Indonesia" if is_id else "English"

    prompt = [
        {
            "role": "system",
            "content": (
                f"Kamu adalah generator kutipan dokumen resmi. Tuliskan satu paragraf pendek (2-3 kalimat) "
                f"dalam {lang} seolah-olah dikutip langsung dari buku pedoman, SOP, atau dokumen resmi "
                f"yang secara langsung menjawab atau menjelaskan pertanyaan berikut. "
                "Jangan sertakan pengantar, langsung tuliskan isi kutipan dokumen."
            ),
        },
        {
            "role": "user",
            "content": f"Pertanyaan / Topik: {query}"
        }
    ]

    try:
        response = await chat_provider.generate_response(
            messages=prompt,
            model=model,
            temperature=0.2,
            max_tokens=200,
        )
        passage = response.strip()
        if passage.startswith('"') and passage.endswith('"'):
            passage = passage[1:-1].strip()

        if len(passage) > 20:
            return passage
    except Exception as e:
        logger.warning(f"HyDE generation skipped: {e}")

    return None


async def rewrite_query_simple(
    original_query: str,
    chat_provider: ILLMProvider,
    model: str,
) -> str:
    variants = await rewrite_query(original_query, chat_provider, model, num_variants=1)
    if len(variants) > 1:
        return variants[1]
    return original_query

