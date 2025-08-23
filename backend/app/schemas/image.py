# app/schemas/image.py
from pydantic import BaseModel, field_validator
from datetime import datetime
import base64

class ImageCreate(BaseModel):
    image_data: bytes
    filename: str
    content_type: str

class ImageOut(BaseModel):
    id: int
    user_id: int
    filename: str
    content_type: str
    image_data: str     # base64 for inline thumbnails
    created_at: datetime

    @field_validator("image_data", mode="before")
    def encode_bytes_to_b64(cls, v):
        if isinstance(v, (bytes, bytearray)):
            return base64.b64encode(v).decode("utf-8")
        return v

    class Config:
        from_attributes = True
