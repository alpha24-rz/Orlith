from pydantic_settings import BaseSettings, SettingsConfigDict
import os

# Locate the root .env relative to the location of backend/core/config.py
_current_dir = os.path.dirname(os.path.abspath(__file__))
_env_file_path = os.path.abspath(os.path.join(_current_dir, "..", "..", ".env"))
if not os.path.exists(_env_file_path):
    _env_file_path = ".env"


class Settings(BaseSettings):
    APP_NAME: str = "DocuMind AI"
    ENVIRONMENT: str = "development"
    SECRET_KEY: str = "replace-this-with-a-very-long-secret-key-min-32-chars"
    
    # AI Settings
    OPENROUTER_API_KEY: str = ""
    LLM_MODEL: str = "deepseek/deepseek-v3.2-exp"
    EMBEDDING_MODEL: str = "openrouter/nvidia/llama-nemotron-embed-vl-1b-v2:free"

    # Database
    DATABASE_URL: str = "postgresql+psycopg://documind:password@localhost:5432/documind"
    CHROMA_PERSIST_DIR: str = "./data/chroma"

    # File Storage
    STORAGE_BACKEND: str = "local"
    STORAGE_LOCAL_PATH: str = "./data/uploads"

    # RAG Settings
    CHUNK_SIZE: int = 1024
    CHUNK_OVERLAP: int = 128
    RAG_CANDIDATE_POOL_SIZE: int = 30
    RAG_FINAL_TOP_K: int = 5
    RAG_SIMILARITY_THRESHOLD: float = 0.5
    
    # Reranker Settings
    ENABLE_RERANKER: bool = True
    RERANKER_MODEL: str = "BAAI/bge-reranker-base"

    # Hybrid Search Settings
    ENABLE_HYBRID_SEARCH: bool = True
    BM25_TOP_K: int = 30
    RRF_K: int = 60

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Logging
    LOG_LEVEL: str = "INFO"

    model_config = SettingsConfigDict(env_file=_env_file_path, extra="ignore")


settings = Settings()

# Ensure directories exist
os.makedirs(settings.STORAGE_LOCAL_PATH, exist_ok=True)
if settings.DATABASE_URL.startswith("sqlite"):
    db_dir = os.path.dirname(settings.DATABASE_URL.replace("sqlite+aiosqlite:///", ""))
    if db_dir and db_dir != ".":
        os.makedirs(db_dir, exist_ok=True)
