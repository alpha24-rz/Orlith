from pydantic import BaseModel, HttpUrl
from typing import Optional, List, Dict, Any
from datetime import datetime

class EndpointBase(BaseModel):
    name: str
    base_url: str
    is_enabled: bool = True

class EndpointCreate(EndpointBase):
    api_key: Optional[str] = None

class EndpointUpdate(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    is_enabled: Optional[bool] = None

class EndpointResponse(EndpointBase):
    id: str
    user_id: str
    has_api_key: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ModelResponse(BaseModel):
    id: str
    name: str
    endpoint_id: str
    endpoint_name: str
    provider_label: str
