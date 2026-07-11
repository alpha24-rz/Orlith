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
    ADMIN_INVITE_CODE: str = ""
    
    # AI Settings
    OPENROUTER_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    LLM_MODEL: str = "deepseek/deepseek-v3.2-exp"
    EMBEDDING_PROVIDER: str = "huggingface"
    EMBEDDING_MODEL: str = "BAAI/bge-m3"

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/documind.db"
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
    
    # Parent-Child Chunking Settings
    ENABLE_PARENT_CHILD_CHUNKING: bool = True
    PARENT_CHUNK_SIZE: int = 1500
    CHILD_CHUNK_SIZE: int = 300
    CHILD_CHUNK_OVERLAP: int = 50
    
    # Reranker Settings
    ENABLE_RERANKER: bool = True
    RERANKER_MODEL: str = "BAAI/bge-reranker-base"

    # Semantic Chunking Settings
    ENABLE_SEMANTIC_CHUNKING: bool = True

    # Hybrid Search Settings
    ENABLE_HYBRID_SEARCH: bool = True
    BM25_TOP_K: int = 30
    RRF_K: int = 60
    BM25_TOP_K: int = 30
    RRF_K: int = 60

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Logging
    LOG_LEVEL: str = "INFO"

    model_config = SettingsConfigDict(env_file=_env_file_path, extra="ignore")


settings = Settings()

# Post-process relative paths to ensure they resolve relative to the project root
_project_root = os.path.abspath(os.path.join(_current_dir, "..", ".."))

# Resolve SQLite DATABASE_URL if it contains a relative path
if settings.DATABASE_URL.startswith("sqlite+aiosqlite:///"):
    db_path = settings.DATABASE_URL.replace("sqlite+aiosqlite:///", "")
    if not os.path.isabs(db_path):
        if db_path.startswith("./"):
            db_path = db_path[2:]
        settings.DATABASE_URL = f"sqlite+aiosqlite:///{os.path.abspath(os.path.join(_project_root, db_path))}"

# Resolve CHROMA_PERSIST_DIR if it's relative
if not os.path.isabs(settings.CHROMA_PERSIST_DIR):
    if settings.CHROMA_PERSIST_DIR.startswith("./"):
        settings.CHROMA_PERSIST_DIR = settings.CHROMA_PERSIST_DIR[2:]
    settings.CHROMA_PERSIST_DIR = os.path.abspath(os.path.join(_project_root, settings.CHROMA_PERSIST_DIR))

# Resolve STORAGE_LOCAL_PATH if it's relative
if not os.path.isabs(settings.STORAGE_LOCAL_PATH):
    if settings.STORAGE_LOCAL_PATH.startswith("./"):
        settings.STORAGE_LOCAL_PATH = settings.STORAGE_LOCAL_PATH[2:]
    settings.STORAGE_LOCAL_PATH = os.path.abspath(os.path.join(_project_root, settings.STORAGE_LOCAL_PATH))

# Ensure directories exist
os.makedirs(settings.STORAGE_LOCAL_PATH, exist_ok=True)
if settings.DATABASE_URL.startswith("sqlite"):
    db_dir = os.path.dirname(settings.DATABASE_URL.replace("sqlite+aiosqlite:///", ""))
    if db_dir and db_dir != ".":
        os.makedirs(db_dir, exist_ok=True)

