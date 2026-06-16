from sqlalchemy import Column, String, Integer, ForeignKey
from sqlalchemy.orm import mapped_column, relationship
from pgvector.sqlalchemy import Vector
from core.database import Base
import uuid

class Chunk(Base):
    __tablename__ = "chunks"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    
    # Text Search Ready
    content = Column(String, nullable=False)
    
    # Citation Metadata
    page_number = Column(Integer, nullable=False)
    section = Column(String, nullable=True)
    chunk_index = Column(Integer, nullable=False)
    token_count = Column(Integer, nullable=False, default=0)
    
    document = relationship("Document", backref="chunks")

class ChunkEmbedding(Base):
    __tablename__ = "chunk_embeddings"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    chunk_id = Column(String, ForeignKey("chunks.id", ondelete="CASCADE"), nullable=False)
    
    provider = Column(String, nullable=False) # e.g. "openai"
    model = Column(String, nullable=False)    # e.g. "text-embedding-3-small"
    dimension = Column(Integer, nullable=False)
    
    # Dimension-less vector definition initially. 
    # PgVector will support dynamic dimensions without strict length constraint this way
    embedding = mapped_column(Vector())
    
    chunk = relationship("Chunk", backref="embeddings")
