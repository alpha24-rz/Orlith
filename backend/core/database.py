from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy import text
from core.config import settings

connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_async_engine(
    settings.DATABASE_URL,
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
