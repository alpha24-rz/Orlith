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
