from pydantic import BaseModel, field_validator
from datetime import datetime
import base64


class ImageBase(BaseModel):
    image_data: bytes

class ImageCreate(ImageBase):
    pass

class ImageOut(BaseModel):
    id: int
    user_id: int
    image_data: str
    created_at: datetime

    @field_validator("image_data", mode="before")
    def decode_bytes(cls, v):
        if isinstance(v, (bytes, bytearray)):
            return base64.b64encode(v).decode("utf-8")
        return v

    class Config:
        from_attributes = True