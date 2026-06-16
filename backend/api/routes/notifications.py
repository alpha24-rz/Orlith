from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import List
from core.database import get_db
from models import User
from models.notification import Notification
from schemas.notification import NotificationResponse
from api.deps import get_current_user
from core.websocket import manager
from jose import jwt, JWTError
from core.config import settings
from core.security import ALGORITHM

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.get("", response_model=List[NotificationResponse])
async def get_notifications(
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()

@router.post("/read-all")
async def mark_all_as_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id)
        .where(Notification.is_read == False)
        .values(is_read=True)
    )
    await db.commit()
    return {"success": True}

@router.post("/{notification_id}/read", response_model=NotificationResponse)
async def mark_as_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Notification)
        .where(Notification.id == notification_id)
        .where(Notification.user_id == current_user.id)
    )
    notif = result.scalars().first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notif.is_read = True
    await db.commit()
    await db.refresh(notif)
    return notif

# Dependency helper for WS auth
async def get_ws_user(token: str, db: AsyncSession) -> User:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            return None
        result = await db.execute(select(User).where(User.email == email))
        return result.scalars().first()
    except JWTError:
        return None

@router.websocket("/ws")
async def websocket_notifications(websocket: WebSocket, token: str, db: AsyncSession = Depends(get_db)):
    await websocket.accept()
    user = await get_ws_user(token, db)
    if not user:
        await websocket.close(code=1008)
        return

    # Use a unique global channel for the user
    channel_id = f"global_{user.id}"
    
    # Manager connect normally does accept(), but since we already accepted, 
    # we should bypass or manually add to manager's active_connections.
    # Wait, in manager.connect it does `await websocket.accept()`.
    # It might throw if already accepted. So we should adjust the websocket manager 
    # or just use manager directly.
    from core.websocket import manager
    if channel_id not in manager.active_connections:
        manager.active_connections[channel_id] = []
    manager.active_connections[channel_id].append(websocket)
    
    try:
        while True:
            # Keep connection alive, listen for pings or client messages
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(channel_id, websocket)
