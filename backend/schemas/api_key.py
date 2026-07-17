from pydantic import BaseModel, ConfigDict, field_validator
from datetime import datetime
from typing import Optional, Literal

VALID_PROVIDERS = ["openai", "anthropic", "ollama", "openrouter", "gemini"]


class APIKeyBase(BaseModel):
    provider: str
    nickname: Optional[str] = None

    @field_validator("provider")
    @classmethod
    def validate_provider(cls, v: str) -> str:
        if v.lower() not in VALID_PROVIDERS:
            raise ValueError(f"Provider must be one of: {', '.join(VALID_PROVIDERS)}")
        return v.lower()


class APIKeyCreate(APIKeyBase):
    api_key: str


class APIKeyToggle(BaseModel):
    is_active: bool


class APIKeyResponse(BaseModel):
    id: str
    provider: str
    nickname: Optional[str] = None
    masked_key: str
    is_active: bool = True
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
