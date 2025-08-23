from app.repositories.image_repo import ImageRepo
from app.schemas.image import ImageCreate, ImageOut
from app.models.image import Image

class ImageService:
    def __init__(self, image_repo: ImageRepo):
        self.image_repo = image_repo

    async def create_image(self, image_in: ImageCreate, user_id: int) -> Image:
        print(user_id)
        return await self.image_repo.create(image_in, user_id)

    async def list_images(self, user_id: int) -> list[Image]:
        return await self.image_repo.get_by_user(user_id)
