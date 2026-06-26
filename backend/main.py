from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from contextlib import asynccontextmanager
import re
from datetime import datetime, timezone
from core.database import init_db
from core.config import settings
from api.routes import (
    providers,
    documents,
    query,
    workspaces,
    auth,
    api_keys,
    extraction,
    agent,
    research,
    usage,
    compare,
    conversations,
    workspace_credentials,
    notifications,
    workflows,
)
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi import _rate_limit_exceeded_handler
import structlog
import logging

# Structlog configuration
structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

# Rate Limiter
from core.rate_limit import limiter


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    if settings.ENVIRONMENT == "production":
        insecure_keys = [
            "replace-this-with-a-very-long-secret-key-min-32-chars",
            "replace-this-with-a-very-long-secret-key-min-32-chars-or-longer",
        ]
        if settings.SECRET_KEY in insecure_keys or len(settings.SECRET_KEY) < 32:
            raise ValueError(
                "CRITICAL SECURITY ERROR: SECRET_KEY is set to a default value "
                "or is less than 32 characters long in production mode! "
                "Please generate a secure random hex key using: "
                "python -c 'import secrets; print(secrets.token_hex(32))' "
                "and update your environment variables."
            )
            
    await init_db()
    yield
    # Shutdown
    pass


app = FastAPI(
    title=settings.APP_NAME,
    description="Open-source document intelligence platform — BYOK, multi-provider, self-hostable.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# CORS — reads allowed origins from CORS_ORIGINS env var
# Supports wildcard patterns like https://*.vercel.app
_raw_origins = settings.CORS_ORIGINS if settings.CORS_ORIGINS else "*"

if _raw_origins == "*":
    # Development mode — allow everything
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,  # credentials cannot be used with allow_origins="*"
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    # Production mode — parse origins, expand wildcard patterns to regex
    _explicit_origins: list[str] = []
    _wildcard_patterns: list[re.Pattern] = []

    for origin in [o.strip() for o in _raw_origins.split(",") if o.strip()]:
        if "*" in origin:
            # Convert https://*.vercel.app → regex
            pattern = re.escape(origin).replace(r"\*", r"[^.]+")
            _wildcard_patterns.append(re.compile(f"^{pattern}$"))
        else:
            _explicit_origins.append(origin)

    def _is_allowed_origin(origin: str) -> bool:
        if origin in _explicit_origins:
            return True
        return any(p.match(origin) for p in _wildcard_patterns)

    class DynamicCORSMiddleware(BaseHTTPMiddleware):
        """CORS middleware supporting wildcard subdomains."""

        async def dispatch(self, request: Request, call_next):
            origin = request.headers.get("origin", "")
            is_preflight = request.method == "OPTIONS" and "access-control-request-method" in request.headers

            if origin and _is_allowed_origin(origin):
                if is_preflight:
                    response = Response(status_code=204)
                else:
                    response = await call_next(request)
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Credentials"] = "true"
                response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, PATCH, OPTIONS"
                response.headers["Access-Control-Allow-Headers"] = "*"
                response.headers["Access-Control-Max-Age"] = "600"
                response.headers["Vary"] = "Origin"
            else:
                response = await call_next(request)

            return response

    app.add_middleware(DynamicCORSMiddleware)

app.include_router(auth.router)
app.include_router(api_keys.router)
app.include_router(providers.router)
app.include_router(documents.router)
app.include_router(query.router)
app.include_router(workspaces.router)
app.include_router(extraction.router)
app.include_router(agent.router)
app.include_router(research.router)
app.include_router(usage.router)
app.include_router(compare.router)
app.include_router(conversations.router)
app.include_router(workspace_credentials.router)
app.include_router(notifications.router)
app.include_router(workflows.router)


@app.get("/")
def read_root():
    return {
        "name": settings.APP_NAME,
        "status": "ok",
        "message": "DocuMind AI Backend is running",
        "docs": "/docs",
    }


@app.get("/health")
async def health_check():
    """Deep health check verifying SQLite and ChromaDB connections."""
    db_status = "unknown"
    chroma_status = "unknown"

    # Check Database
    try:
        from core.database import get_db
        from sqlalchemy import text

        async for db in get_db():
            await db.execute(text("SELECT 1"))
            db_status = "connected"
            break
    except Exception as e:
        db_status = f"error: {str(e)}"

    # Check Chroma
    try:
        from core.chroma import get_chroma_client

        client = get_chroma_client()
        client.heartbeat()
        chroma_status = "connected"
    except Exception as e:
        chroma_status = f"error: {str(e)}"

    return {
        "status": "healthy"
        if db_status == "connected" and chroma_status == "connected"
        else "unhealthy",
        "service": settings.APP_NAME,
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "dependencies": {"database": db_status, "chroma": chroma_status},
    }
