from pydantic import BaseModel, ConfigDict, model_validator
from datetime import datetime
from typing import Optional, Any, Dict


class DocumentBase(BaseModel):
    filename: str


class DocumentCreate(DocumentBase):
    pass


class DocumentResponse(DocumentBase):
    id: str
    workspace_id: str
    file_type: str
    file_size: int
    status: str
    content_hash: Optional[str] = None
    page_count: Optional[int] = None
    word_count: Optional[int] = None
    mime_type: Optional[str] = None
    text_hash: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def populate_metadata(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "metadata_json" in data and "metadata" not in data:
                data["metadata"] = data["metadata_json"]
        else:
            # Check if it's an object with metadata_json
            metadata_val = getattr(data, "metadata_json", None)
            return {
                "id": getattr(data, "id"),
                "workspace_id": getattr(data, "workspace_id"),
                "filename": getattr(data, "filename"),
                "file_type": getattr(data, "file_type"),
                "file_size": getattr(data, "file_size"),
                "status": getattr(data, "status"),
                "content_hash": getattr(data, "content_hash", None),
                "page_count": getattr(data, "page_count", None),
                "word_count": getattr(data, "word_count", None),
                "mime_type": getattr(data, "mime_type", None),
                "text_hash": getattr(data, "text_hash", None),
                "metadata": metadata_val,
                "created_at": getattr(data, "created_at"),
            }
        return data
