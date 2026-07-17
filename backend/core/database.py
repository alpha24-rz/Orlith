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
if "postgresql" in db_url:
    connect_args["prepare_threshold"] = None

engine = create_async_engine(
    db_url,
    echo=False,
    connect_args=connect_args,
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

    # Run dynamic column migrations OUTSIDE the main transaction.
    # On PostgreSQL, a failed ALTER TABLE aborts the entire transaction,
    # so we must run each migration in its own independent transaction.
    is_postgres = not settings.DATABASE_URL.startswith("sqlite")

    migrations = [
        "ALTER TABLE documents ADD COLUMN content_hash VARCHAR",
        "ALTER TABLE documents ADD COLUMN error_message VARCHAR",
        "ALTER TABLE documents ADD COLUMN page_count INTEGER",
        "ALTER TABLE documents ADD COLUMN word_count INTEGER",
        "ALTER TABLE documents ADD COLUMN mime_type VARCHAR",
        "ALTER TABLE documents ADD COLUMN text_hash VARCHAR",
        "ALTER TABLE workspaces ADD COLUMN active_llm_provider VARCHAR",
        "ALTER TABLE workspaces ADD COLUMN active_llm_model VARCHAR",
        "ALTER TABLE workspaces ADD COLUMN active_embedding_provider VARCHAR",
        "ALTER TABLE workspaces ADD COLUMN active_embedding_model VARCHAR",
        "ALTER TABLE chunks ADD COLUMN parent_content VARCHAR",
        "ALTER TABLE user_api_keys ADD COLUMN is_active BOOLEAN DEFAULT TRUE",
    ]

    for sql in migrations:
        try:
            if is_postgres:
                # Use IF NOT EXISTS syntax for PostgreSQL (9.6+)
                sql = sql.replace("ADD COLUMN ", "ADD COLUMN IF NOT EXISTS ")
            async with engine.begin() as conn:
                await conn.execute(text(sql))
        except Exception:
            pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
