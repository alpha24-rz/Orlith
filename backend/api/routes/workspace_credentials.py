from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from core.database import get_db
from models.user import User
from models.workspace import Workspace
from models.credential import WorkspaceCredential
from api.deps import get_current_user
from providers.manager import SUPPORTED_PROVIDERS, ProviderManager
from services.validation import WorkspaceValidator
from core.security import encrypt_api_key, decrypt_api_key
import json

router = APIRouter(prefix="/workspaces/{workspace_id}", tags=["Workspace Credentials"])

async def get_workspace_or_404(workspace_id: str, db: AsyncSession, current_user: User) -> Workspace:
    result = await db.execute(
        select(Workspace).where(Workspace.id == workspace_id, Workspace.owner_id == current_user.id)
    )
    ws = result.scalars().first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws

@router.get("/credentials")
async def list_credentials(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await get_workspace_or_404(workspace_id, db, current_user)
    result = await db.execute(
        select(WorkspaceCredential).where(WorkspaceCredential.workspace_id == workspace_id)
    )
    creds = result.scalars().all()
    # Mask credentials before sending to client
    out = []
    for c in creds:
        try:
            cred_json = json.loads(decrypt_api_key(c.encrypted_credential_json))
            # Mask any key that might be sensitive
            for k, v in cred_json.items():
                if "key" in k.lower() or "secret" in k.lower() or "token" in k.lower():
                    cred_json[k] = f"{str(v)[:4]}...{str(v)[-4:]}" if len(str(v)) > 8 else "***"
        except:
            cred_json = {}
        out.append({
            "id": c.id,
            "provider": c.provider,
            "provider_type": c.provider_type,
            "credential_masked": cred_json,
            "created_at": c.created_at,
            "updated_at": c.updated_at
        })
    return out

@router.post("/credentials")
async def create_credential(
    workspace_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    payload: { provider: 'openai', provider_type: 'cloud', credential_json: {api_key: 'sk-...'} }
    """
    ws = await get_workspace_or_404(workspace_id, db, current_user)
    
    provider = payload.get("provider")
    provider_type = payload.get("provider_type")
    credential_json = payload.get("credential_json")
    
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail="Unsupported provider")
    
    # Optional: test it immediately
    try:
        adapter = ProviderManager.get_provider(provider, credential_json)
        is_valid = await adapter.validate_api_key()
        if not is_valid:
            raise HTTPException(status_code=400, detail="Invalid credential")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    enc_json = encrypt_api_key(json.dumps(credential_json))
    
    cred = WorkspaceCredential(
        workspace_id=workspace_id,
        provider=provider,
        provider_type=provider_type,
        encrypted_credential_json=enc_json
    )
    db.add(cred)
    await db.commit()
    await db.refresh(cred)
    return {"id": cred.id, "message": "Credential saved"}

@router.delete("/credentials/{cred_id}")
async def delete_credential(
    workspace_id: str,
    cred_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await get_workspace_or_404(workspace_id, db, current_user)
    result = await db.execute(
        select(WorkspaceCredential).where(WorkspaceCredential.id == cred_id, WorkspaceCredential.workspace_id == workspace_id)
    )
    cred = result.scalars().first()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
        
    await db.delete(cred)
    await db.commit()
    return {"message": "Deleted"}

@router.get("/health")
async def get_health(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ws = await get_workspace_or_404(workspace_id, db, current_user)
    return await WorkspaceValidator.get_health(db, ws)

@router.post("/test-provider")
async def test_provider(
    workspace_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    import time
    ws = await get_workspace_or_404(workspace_id, db, current_user)
    provider_name = payload.get("provider")
    
    # Try fetching saved cred
    result = await db.execute(
        select(WorkspaceCredential).where(
            WorkspaceCredential.workspace_id == workspace_id,
            WorkspaceCredential.provider == provider_name
        )
    )
    cred = result.scalars().first()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found for this provider")
        
    cred_json = json.loads(decrypt_api_key(cred.encrypted_credential_json))
    
    start_time = time.time()
    try:
        adapter = ProviderManager.get_provider(provider_name, cred_json)
        is_valid = await adapter.validate_api_key()
        latency = int((time.time() - start_time) * 1000)
        
        if is_valid:
            return {"success": True, "latency_ms": latency}
        else:
            return {"success": False, "error": "Validation failed"}
    except Exception as e:
        return {"success": False, "error": str(e)}
