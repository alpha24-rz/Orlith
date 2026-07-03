from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy import text
from core.config import settings

import socket
import urllib.parse
import logging

logger = logging.getLogger(__name__)

connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False
else:
    # Resolve host to IPv4 for Hugging Face Spaces (IPv6 network unreachable issue)
    try:
        from sqlalchemy.engine.url import make_url
        # Parse connection string using SQLAlchemy's own URL parser to avoid urlparse issues with special characters in passwords
        u = make_url(settings.DATABASE_URL)
        if u.host:
            # Resolve only IPv4 (AF_INET) addresses
            addr_info = socket.getaddrinfo(u.host, u.port or 5432, socket.AF_INET, socket.SOCK_STREAM)
            ipv4_addresses = [info[4][0] for info in addr_info if info[4]]
            if ipv4_addresses:
                connect_args["hostaddr"] = ipv4_addresses[0]
                logger.info(f"Resolved database host {u.host} to IPv4: {ipv4_addresses[0]}")
    except Exception as e:
        logger.warning(f"Failed to resolve database host to IPv4: {e}")

db_url = settings.DATABASE_URL
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)

# Disable prepared statement cache for PostgreSQL to avoid DuplicatePreparedStatement errors (especially with transaction poolers like PgBouncer)
engine_args = {}
if "postgresql" in db_url:
    engine_args["prepared_statement_cache_size"] = 0

engine = create_async_engine(
    db_url,
    echo=False,
    connect_args=connect_args,
    **engine_args
)

AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db():
    import models

    async with engine.begin() as conn:
        if settings.DATABASE_URL.startswith("sqlite"):
            await conn.execute(text("PRAGMA journal_mode=WAL"))
            await conn.execute(text("PRAGMA foreign_keys=ON"))
        else:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

        await conn.run_sync(Base.metadata.create_all)

        if settings.DATABASE_URL.startswith("sqlite"):
            # Add columns dynamically if they do not exist
            try:
                await conn.execute(
                    text("ALTER TABLE documents ADD COLUMN content_hash VARCHAR")
                )
            except Exception:
                pass

            try:
                await conn.execute(
                    text("ALTER TABLE documents ADD COLUMN error_message VARCHAR")
                )
            except Exception:
                pass
            
            # Migrate Workspace AI configs
            for col in ["active_llm_provider", "active_llm_model", "active_embedding_provider", "active_embedding_model"]:
                try:
                    await conn.execute(
                        text(f"ALTER TABLE workspaces ADD COLUMN {col} VARCHAR")
                    )
                except Exception:
                    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
