from .base import ILLMProvider, IEmbeddingProvider
from typing import AsyncIterator
import httpx
import json
import logging

logger = logging.getLogger(__name__)

class GeminiProvider(ILLMProvider, IEmbeddingProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key
        # Use Gemini's OpenAI-compatible endpoint
        self.base_url = "https://generativelanguage.googleapis.com/v1beta/openai"
        self.headers = {
            "x-goog-api-key": self.api_key,
            "Content-Type": "application/json",
        }
        # Only attach Authorization Bearer if it is explicitly an OAuth access token (ya29.)
        if self.api_key.startswith("ya29."):
            self.headers["Authorization"] = f"Bearer {self.api_key}"

    def _clean_model_name(self, model: str) -> str:
        if not model or model in ("default", "gemini", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.5-flash", "models/gemini-1.5-flash", "models/gemini-2.5-flash"):
            return "gemini-3.5-flash"
        return model.replace("models/", "")

    def _format_messages_for_native(self, messages: list[dict]) -> list[dict]:
        contents = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            native_role = "model" if role in ("assistant", "model") else "user"
            if role == "system":
                contents.append({
                    "role": "user",
                    "parts": [{"text": f"[System Instructions]: {content}"}]
                })
            else:
                contents.append({
                    "role": native_role,
                    "parts": [{"text": str(content)}]
                })
        # Merge adjacent messages of the same role
        merged = []
        for c in contents:
            if merged and merged[-1]["role"] == c["role"]:
                merged[-1]["parts"][0]["text"] += "\n\n" + c["parts"][0]["text"]
            else:
                merged.append(c)
        return merged

    async def generate_response(
        self,
        messages: list[dict],
        model: str,
        temperature: float = 0.1,
        max_tokens: int = 2048,
        **kwargs,
    ) -> str:
        clean_model = self._clean_model_name(model)
        models_to_try = []
        for m in [clean_model, "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"]:
            if m not in models_to_try:
                models_to_try.append(m)

        async with httpx.AsyncClient(timeout=60) as client:
            # First try OpenAI compatible endpoint if using standard AIza key or OAuth token
            if self.api_key.startswith("AIza") or self.api_key.startswith("ya29."):
                payload = {
                    "model": clean_model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                }
                headers_openai = dict(self.headers)
                if "Authorization" not in headers_openai and self.api_key.startswith("AIza"):
                    headers_openai["Authorization"] = f"Bearer {self.api_key}"
                try:
                    resp = await client.post(
                        f"{self.base_url}/chat/completions?key={self.api_key}",
                        json=payload,
                        headers=headers_openai,
                    )
                    if resp.status_code == 200:
                        return resp.json()["choices"][0]["message"]["content"]
                except Exception as e:
                    logger.debug(f"OpenAI compatible endpoint failed ({e}), trying native generateContent")

            # Fallback to Google AI Studio native generateContent endpoint with model retry for 404s/401s
            last_err = None
            for m in models_to_try:
                native_url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={self.api_key}"
                native_payload = {
                    "contents": self._format_messages_for_native(messages),
                    "generationConfig": {
                        "temperature": temperature,
                        "maxOutputTokens": max_tokens,
                    }
                }
                try:
                    resp_native = await client.post(
                        native_url,
                        json=native_payload,
                        headers=self.headers,
                    )
                    if resp_native.status_code in (404, 401, 400) and m != models_to_try[-1]:
                        logger.warning(f"Model {m} returned {resp_native.status_code} on generateContent, trying alternative model...")
                        continue
                    resp_native.raise_for_status()
                    data = resp_native.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        texts = [p.get("text", "") for p in parts if "text" in p]
                        return "\n".join(texts)
                    return ""
                except Exception as e:
                    last_err = e
                    continue

            if last_err:
                raise last_err
            return ""

    async def stream_response(
        self,
        messages: list[dict],
        model: str,
        temperature: float = 0.1,
        max_tokens: int = 2048,
        **kwargs,
    ) -> AsyncIterator[str]:
        clean_model = self._clean_model_name(model)
        models_to_try = []
        for m in [clean_model, "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"]:
            if m not in models_to_try:
                models_to_try.append(m)

        async with httpx.AsyncClient(timeout=60) as client:
            use_native = True
            if self.api_key.startswith("AIza") or self.api_key.startswith("ya29."):
                use_native = False
                payload = {
                    "model": clean_model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    "stream": True,
                }
                headers_openai = dict(self.headers)
                if "Authorization" not in headers_openai and self.api_key.startswith("AIza"):
                    headers_openai["Authorization"] = f"Bearer {self.api_key}"
                try:
                    req = client.build_request(
                        "POST",
                        f"{self.base_url}/chat/completions?key={self.api_key}",
                        json=payload,
                        headers=headers_openai,
                    )
                    resp = await client.send(req, stream=True)
                    if resp.status_code != 200:
                        await resp.aclose()
                        use_native = True
                    else:
                        async for line in resp.aiter_lines():
                            if line.startswith("data: ") and line != "data: [DONE]":
                                try:
                                    chunk = json.loads(line[6:])
                                    content = (
                                        chunk.get("choices", [{}])[0]
                                        .get("delta", {})
                                        .get("content", "")
                                    )
                                    if content:
                                        yield content
                                except Exception:
                                    pass
                        await resp.aclose()
                except Exception:
                    use_native = True

            # Fallback to Google AI Studio native streamGenerateContent endpoint with model retry for 404s/401s
            if use_native:
                for m in models_to_try:
                    native_url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:streamGenerateContent?key={self.api_key}&alt=sse"
                    native_payload = {
                        "contents": self._format_messages_for_native(messages),
                        "generationConfig": {
                            "temperature": temperature,
                            "maxOutputTokens": max_tokens,
                        }
                    }
                    try:
                        req_native = client.build_request(
                            "POST",
                            native_url,
                            json=native_payload,
                            headers=self.headers,
                        )
                        native_resp = await client.send(req_native, stream=True)
                        if native_resp.status_code in (404, 401, 400) and m != models_to_try[-1]:
                            await native_resp.aclose()
                            logger.warning(f"Model {m} returned {native_resp.status_code} on streamGenerateContent, trying alternative model...")
                            continue
                        native_resp.raise_for_status()
                        async for line in native_resp.aiter_lines():
                            if line.startswith("data: "):
                                try:
                                    chunk = json.loads(line[6:])
                                    candidates = chunk.get("candidates", [])
                                    if candidates:
                                        parts = candidates[0].get("content", {}).get("parts", [])
                                        for p in parts:
                                            if "text" in p and p["text"]:
                                                yield p["text"]
                                except Exception:
                                    pass
                        await native_resp.aclose()
                        break
                    except Exception as e:
                        logger.error(f"Error streaming from {m}: {e}")
                        continue

    async def get_available_models(self) -> list[str]:
        return ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"]

    async def validate_api_key(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{self.base_url}/models?key={self.api_key}",
                    headers=self.headers,
                )
                return resp.status_code == 200
        except Exception:
            return False

    async def embed(self, texts: list[str], model: str) -> list[list[float]]:
        embedding_model = model
        if not embedding_model or embedding_model == "default" or "gemini-embedding-001" in embedding_model:
            embedding_model = "text-embedding-004"
        else:
            embedding_model = embedding_model.replace("models/", "")

        payload = {
            "model": embedding_model,
            "input": texts,
        }
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{self.base_url}/embeddings?key={self.api_key}",
                json=payload,
                headers=self.headers,
            )
            resp.raise_for_status()
            data = resp.json()["data"]
            data.sort(key=lambda x: x["index"])
            return [item["embedding"] for item in data]


class InteractionsGeminiProvider(ILLMProvider, IEmbeddingProvider):
    """
    Advanced adapter using the new Gemini Interactions API (/v1beta/interactions).
    Supports:
      - Stateful multi-turn conversations (via `previous_interaction_id`)
      - Granular SSE streaming (`step.delta`)
      - Native tools (e.g. `google_search` grounding)
      - Strict structured output (`response_format` with schema)
      - Background execution (`background=True`)
    """
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://generativelanguage.googleapis.com/v1beta/interactions"
        self.headers = {
            "x-goog-api-key": self.api_key,
            "Content-Type": "application/json",
        }
        if self.api_key.startswith("ya29."):
            self.headers["Authorization"] = f"Bearer {self.api_key}"
        self._embedding_delegate = GeminiProvider(api_key)

    def _prepare_input(self, messages: list[dict], previous_interaction_id: str = None, store: bool = True) -> dict | list | str:
        if previous_interaction_id and messages:
            return messages[-1].get("content", "")
        
        if len(messages) == 1 and isinstance(messages[0].get("content"), str):
            return messages[0].get("content")
            
        formatted_input = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role == "system":
                formatted_input.append({
                    "type": "user_input",
                    "content": [{"type": "text", "text": f"[System Instructions]: {content}"}]
                })
            elif role in ("assistant", "model"):
                formatted_input.append({
                    "type": "model_output",
                    "content": [{"type": "text", "text": str(content)}]
                })
            else:
                if isinstance(content, str):
                    formatted_input.append({
                        "type": "user_input",
                        "content": [{"type": "text", "text": content}]
                    })
                else:
                    formatted_input.append({
                        "type": "user_input",
                        "content": content
                    })
        return formatted_input

    def _clean_model_name(self, model: str) -> str:
        if not model or model in ("default", "gemini", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.5-flash", "models/gemini-1.5-flash", "models/gemini-2.5-flash"):
            return "gemini-3.5-flash"
        return model.replace("models/", "")

    async def generate_response(
        self,
        messages: list[dict],
        model: str,
        temperature: float = 0.1,
        max_tokens: int = 2048,
        **kwargs,
    ) -> str:
        previous_interaction_id = kwargs.get("previous_interaction_id")
        store = kwargs.get("store", True)
        tools = kwargs.get("tools")
        response_format = kwargs.get("response_format")
        background = kwargs.get("background", False)

        clean_model = self._clean_model_name(model)
        models_to_try = []
        for m in [clean_model, "gemini-3.5-flash", "gemini-3.1-flash-image", "gemini-2.0-flash"]:
            if m not in models_to_try:
                models_to_try.append(m)

        input_data = self._prepare_input(messages, previous_interaction_id, store)
        
        async with httpx.AsyncClient(timeout=90) as client:
            last_err = None
            for m in models_to_try:
                payload = {
                    "model": m,
                    "input": input_data,
                }
                if previous_interaction_id:
                    payload["previous_interaction_id"] = previous_interaction_id
                if not previous_interaction_id and not store:
                    payload["store"] = False
                if tools:
                    payload["tools"] = tools
                if response_format:
                    payload["response_format"] = response_format
                if background:
                    payload["background"] = True

                try:
                    resp = await client.post(
                        f"{self.base_url}?key={self.api_key}",
                        json=payload,
                        headers=self.headers,
                    )
                    if resp.status_code in (404, 401, 400, 429) and m != models_to_try[-1]:
                        logger.warning(f"Model {m} returned {resp.status_code} on Interactions API, trying alternative model...")
                        continue
                    resp.raise_for_status()
                    data = resp.json()
                    
                    if "output_text" in data and data["output_text"]:
                        return data["output_text"]
                        
                    steps = data.get("steps", [])
                    output_texts = []
                    for step in steps:
                        if step.get("type") == "model_output":
                            for c in step.get("content", []):
                                if c.get("type") == "text" and c.get("text"):
                                    output_texts.append(c["text"])
                    return "\n".join(output_texts) if output_texts else ""
                except Exception as e:
                    last_err = e
                    continue

            if last_err:
                raise last_err
            return ""

    async def stream_response(
        self,
        messages: list[dict],
        model: str,
        temperature: float = 0.1,
        max_tokens: int = 2048,
        **kwargs,
    ) -> AsyncIterator[str]:
        previous_interaction_id = kwargs.get("previous_interaction_id")
        store = kwargs.get("store", True)
        tools = kwargs.get("tools")
        response_format = kwargs.get("response_format")

        clean_model = self._clean_model_name(model)
        models_to_try = []
        for m in [clean_model, "gemini-3.5-flash", "gemini-3.1-flash-image", "gemini-2.0-flash"]:
            if m not in models_to_try:
                models_to_try.append(m)

        input_data = self._prepare_input(messages, previous_interaction_id, store)

        async with httpx.AsyncClient(timeout=90) as client:
            last_err = None
            for m in models_to_try:
                payload = {
                    "model": m,
                    "input": input_data,
                    "stream": True,
                }
                if previous_interaction_id:
                    payload["previous_interaction_id"] = previous_interaction_id
                if not previous_interaction_id and not store:
                    payload["store"] = False
                if tools:
                    payload["tools"] = tools
                if response_format:
                    payload["response_format"] = response_format

                try:
                    req = client.build_request(
                        "POST",
                        f"{self.base_url}?key={self.api_key}&alt=sse",
                        json=payload,
                        headers=self.headers,
                    )
                    resp = await client.send(req, stream=True)
                    if resp.status_code in (404, 401, 400, 429) and m != models_to_try[-1]:
                        await resp.aclose()
                        logger.warning(f"Model {m} returned {resp.status_code} on Interactions stream API, trying alternative model...")
                        continue
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if line.startswith("data: ") and line != "data: [DONE]":
                            try:
                                data = json.loads(line[6:])
                                event_type = data.get("event_type")
                                if event_type == "step.delta":
                                    delta = data.get("delta", {})
                                    if delta.get("type") == "text" and delta.get("text"):
                                        yield delta["text"]
                            except Exception:
                                pass
                    await resp.aclose()
                    return
                except Exception as e:
                    last_err = e
                    continue

            if last_err:
                raise last_err

    async def get_available_models(self) -> list[str]:
        return ["gemini-3.5-flash", "gemini-3.1-flash-image", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"]

    async def validate_api_key(self) -> bool:
        return await self._embedding_delegate.validate_api_key()

    async def embed(self, texts: list[str], model: str) -> list[list[float]]:
        return await self._embedding_delegate.embed(texts, model)


