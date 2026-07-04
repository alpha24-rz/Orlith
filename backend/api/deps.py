from fastapi import Depends, HTTPException, status, Cookie, Query
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from models import User, Workspace
from sqlalchemy import select
from core.config import settings
from core.security import ALGORITHM, get_password_hash
from typing import Optional

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    token_cookie: Optional[str] = Cookie(None, alias="token"),
    token_query: Optional[str] = Query(None, alias="token"),
    db: AsyncSession = Depends(get_db),
) -> User:
    actual_token = token or token_cookie or token_query
    if actual_token:
        try:
            payload = jwt.decode(actual_token, settings.SECRET_KEY, algorithms=[ALGORITHM])
            email: str = payload.get("sub")
            if email:
                result = await db.execute(select(User).where(User.email == email))
                user = result.scalars().first()
                if user:
                    return user
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except (JWTError, Exception):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # If no token is provided, enforce auth in production
    if settings.ENVIRONMENT == "production":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Fallback to test/default user in dev/test environment
    result = await db.execute(select(User))
    user = result.scalars().first()
    if user is None:
        # Create a default test user
        user = User(
            email="test@example.com",
            username="test_user",
            hashed_password=get_password_hash("testpassword")
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    return user



async def get_workspace(
    workspace_id: str, db: AsyncSession = Depends(get_db)
) -> Workspace:
    workspace = await db.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return workspace


async def get_user_workspace(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Workspace:
    workspace = await get_workspace(workspace_id, db)
    if workspace.owner_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="You do not have access to this workspace"
        )
    return workspace


async def get_workspace_member(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Workspace:
    from models.workspace_member import WorkspaceMember
    workspace = await get_workspace(workspace_id, db)
    
    # Check ownership
    if workspace.owner_id == current_user.id:
        return workspace
        
    # Check collaborator membership
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == current_user.id
        )
    )
    member = result.scalars().first()
    if not member:
        raise HTTPException(
            status_code=403, detail="You do not have access to this workspace"
        )
    return workspace

