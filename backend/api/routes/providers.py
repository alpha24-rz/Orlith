from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.database import get_db
from models import UserAPIKey, User
from schemas import APIKeyCreate, APIKeyResponse
from core.security import encrypt_api_key, mask_api_key
from providers import get_provider_adapter
from api.deps import get_current_user
from typing import List
from services.ai.registry import ModelInfo

router = APIRouter(prefix="/providers", tags=["Providers"])


@router.get("/models", response_model=List[ModelInfo])
async def list_all_models(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    force_refresh: bool = False,
):
    from services.ai.registry import ModelRegistry
    return await ModelRegistry.get_models(current_user.id, db, force_refresh)


@router.get("/{provider_id}/models", response_model=List[str])
async def list_provider_models(
    provider_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from core.security import decrypt_api_key

    result = await db.execute(
        select(UserAPIKey).where(
            UserAPIKey.user_id == current_user.id, UserAPIKey.provider == provider_id
        )
    )
    key_record = result.scalars().first()

    # Special case: ollama can work without a key record (defaulting to local)
    if provider_id == "ollama" and not key_record:
        try:
            adapter = get_provider_adapter("ollama")
            return await adapter.get_available_models()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to fetch models: {str(e)}")

    if not key_record:
        raise HTTPException(
            status_code=404, detail="API key not found for this provider"
        )

    raw_key = decrypt_api_key(key_record.encrypted_key)

    try:
        adapter = get_provider_adapter(provider_id, raw_key)
        models = await adapter.get_available_models()
        return models
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch models: {str(e)}")
