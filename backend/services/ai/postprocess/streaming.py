import json
from typing import Dict, Any

def format_sse_event(event: str, data: Dict[str, Any]) -> str:
    """Format a general SSE event string with key-value payloads."""
    payload = {"event": event, **data}
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

def format_sse_text(text: str) -> str:
    """Format standard text streaming chunks."""
    return f"data: {json.dumps({'text': text}, ensure_ascii=False)}\n\n"

def format_sse_meta(meta: Dict[str, Any]) -> str:
    """Format metadata events (like citation payloads)."""
    return f"data: {json.dumps({'meta': meta}, ensure_ascii=False)}\n\n"

def format_llm_error_message(e: Exception) -> str:
    """Parse raw LLM exceptions into user-friendly Indonesian error messages."""
    error_str = str(e).lower()
    if "ratelimiterror" in error_str or "429" in error_str or "rate limit" in error_str or "rate-limited" in error_str:
        return "\n\n> ⚠️ **Gagal memproses:** Model LLM yang dipilih saat ini sedang sibuk atau melampaui batas permintaan (*Rate Limit*). Harap tunggu beberapa saat lalu coba lagi, atau ganti ke model LLM yang lain pada menu di atas."
    elif "context_length_exceeded" in error_str or "token limit" in error_str or "400" in error_str:
        return "\n\n> ⚠️ **Gagal memproses:** Teks/dokumen terlalu panjang untuk model ini. Coba gunakan model dengan kapasitas konteks yang lebih besar atau mulai obrolan baru."
    else:
        return f"\n\n> ⚠️ **Gagal memproses:** Terjadi gangguan koneksi ke penyedia LLM.\n\n```text\n{str(e)}\n```"
