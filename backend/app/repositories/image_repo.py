from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, LargeBinary
from app.models.image import Image
from app.schemas.image import ImageCreate, ImageOut
import base64

class ImageRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, image_in: ImageCreate, user_id: int) -> Image:
        # raw_bytes = base64.b64decode(image_in.image_data)
        db_image = Image(image_data=image_in.image_data, user_id=user_id)
        self.db.add(db_image)
        await self.db.commit()
        await self.db.refresh(db_image)
        return db_image

    async def get_by_user(self, user_id: int) -> list[Image]:
        result = await self.db.execute(select(Image).where(Image.user_id == user_id))
        return result.scalars().all()