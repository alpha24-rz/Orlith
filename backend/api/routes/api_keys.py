from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.database import get_db
from models import UserAPIKey, User
from schemas import APIKeyCreate, APIKeyResponse
from core.security import encrypt_api_key, decrypt_api_key, mask_api_key
from providers import get_provider_adapter, SUPPORTED_PROVIDERS
from api.deps import get_current_user
from typing import List

router = APIRouter(prefix="/api-keys", tags=["API Keys"])


def _mask(raw_key: str) -> str:
    """Return masked key — first 8 chars, dots, last 4 chars."""
    if len(raw_key) <= 8:
        return "••••••••"
    return raw_key[:8] + "•" * max(4, len(raw_key) - 12) + raw_key[-4:]


@router.get("/providers", tags=["API Keys"])
async def list_supported_providers():
    """Return the list of supported providers for the frontend dropdown."""
    return {"providers": SUPPORTED_PROVIDERS}


@router.post("", response_model=APIKeyResponse, status_code=status.HTTP_201_CREATED)
async def save_api_key(
    payload: APIKeyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Test the key with a lightweight API call, encrypt, and store it."""
    # Probe the provider
    try:
        adapter = get_provider_adapter(payload.provider, payload.api_key)
        valid = await adapter.validate_api_key()
        if not valid:
            raise ValueError("Validation probe returned False")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"API key validation failed for {payload.provider}: {str(e)}",
        )

    # Enforce one key per provider per user (update if exists)
    result = await db.execute(
        select(UserAPIKey).where(
            UserAPIKey.user_id == current_user.id,
            UserAPIKey.provider == payload.provider,
        )
    )
    existing = result.scalars().first()

    masked = _mask(payload.api_key)
    encrypted = encrypt_api_key(payload.api_key)

    from services.ai.registry import ModelRegistry

    if existing:
        existing.encrypted_key = encrypted
        existing.nickname = payload.nickname or existing.nickname
        await db.commit()
        await db.refresh(existing)
        ModelRegistry.invalidate_cache(current_user.id)
        return APIKeyResponse(
            id=existing.id,
            provider=existing.provider,
            nickname=existing.nickname,
            masked_key=masked,
            created_at=existing.created_at,
        )

    key_record = UserAPIKey(
        user_id=current_user.id,
        provider=payload.provider,
        nickname=payload.nickname,
        encrypted_key=encrypted,
    )
    db.add(key_record)
    await db.commit()
    await db.refresh(key_record)
    ModelRegistry.invalidate_cache(current_user.id)

    return APIKeyResponse(
        id=key_record.id,
        provider=key_record.provider,
        nickname=key_record.nickname,
        masked_key=masked,
        created_at=key_record.created_at,
    )


@router.get("", response_model=List[APIKeyResponse])
async def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all stored API keys for the current user — plain text NEVER returned."""
    result = await db.execute(
        select(UserAPIKey).where(UserAPIKey.user_id == current_user.id)
    )
    keys = result.scalars().all()

    return [
        APIKeyResponse(
            id=key.id,
            provider=key.provider,
            nickname=key.nickname,
            # Decrypt only to re-mask; the raw value never leaves this function
            masked_key=_mask(decrypt_api_key(key.encrypted_key)),
            created_at=key.created_at,
        )
        for key in keys
    ]


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_api_key(
    key_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an API key owned by the current user."""
    key = await db.get(UserAPIKey, key_id)
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")
    if key.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this key")
    await db.delete(key)
    await db.commit()
    from services.ai.registry import ModelRegistry
    ModelRegistry.invalidate_cache(current_user.id)
