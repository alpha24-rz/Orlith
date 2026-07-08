from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.database import get_db
from models import User
from schemas import UserCreate, UserResponse, UserLogin, Token
from core.security import verify_password, get_password_hash, create_access_token
from api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED
)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if user with this email already exists
    result = await db.execute(select(User).where(User.email == payload.email))
    existing_user = result.scalars().first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Generate username from email if not provided
    username = payload.username
    if not username:
        username = payload.email.split("@")[0]
        # In case the generated username already exists, check and append a suffix if needed
        username_check = await db.execute(select(User).where(User.username == username))
        if username_check.scalars().first():
            import random

            username = f"{username}_{random.randint(1000, 9999)}"

    hashed_password = get_password_hash(payload.password)

    user = User(email=payload.email, username=username, hashed_password=hashed_password)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=Token)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalars().first()
    
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer", "user": user}


@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/demo", response_model=Token)
async def login_demo(request: Request, db: AsyncSession = Depends(get_db)):
    import hashlib

    # Extract client IP address, checking standard proxy headers first
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        client_ip = x_forwarded_for.split(",")[0].strip()
    else:
        x_real_ip = request.headers.get("x-real-ip")
        if x_real_ip:
            client_ip = x_real_ip.strip()
        else:
            client_ip = request.client.host if request.client else "127.0.0.1"

    # Create a stable, short hash of the IP address
    ip_hash = hashlib.md5(client_ip.encode()).hexdigest()[:12]
    demo_email = f"demo_{ip_hash}@example.com"
    demo_username = f"Guest_{ip_hash}"

    # Find or create a demo user specific to this IP hash
    result = await db.execute(select(User).where(User.email == demo_email))
    user = result.scalars().first()
    if not user:
        user = User(
            email=demo_email,
            username=demo_username,
            hashed_password=get_password_hash(f"demopassword_{ip_hash}")
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer", "user": user}
