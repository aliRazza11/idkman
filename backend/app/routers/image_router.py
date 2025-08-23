from fastapi import APIRouter, Depends, Request, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.db.session import get_db
from app.schemas.image import ImageCreate, ImageOut
from app.repositories.image_repo import ImageRepo
from app.services.image_service import ImageService
from app.services.auth_service import AuthService
from app.models.user import User
from app.repositories.user_repo import UserRepo

router = APIRouter(prefix="/auth", tags=["Images"])

# @router.post("/upload", response_model=ImageOut, status_code=status.HTTP_201_CREATED)
# async def upload_image(
#     payload: ImageCreate,
#     request: Request,
#     db: AsyncSession = Depends(get_db)
# ):
#     print("ROUTER POST CALLED")
#     auth_service = AuthService(user_repo=None)  # you might already inject this differently
#     current_user: User = await auth_service.get_current_user(request, db)
#     image_service = ImageService(ImageRepo(db))
#     return await image_service.create_image(payload, current_user.id)

async def get_current_user_dep(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> User:
    auth_service = AuthService(UserRepo(db))
    return await auth_service.get_current_user(request)

@router.post("/upload", response_model=ImageOut, status_code=status.HTTP_201_CREATED)
async def upload_image(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_dep),
):
    contents = await file.read()
    image_in = ImageCreate(image_data=contents)
    image_service = ImageService(ImageRepo(db))
    return await image_service.create_image(image_in, current_user.id)

@router.get("/upload", response_model=List[ImageOut])
async def list_user_images(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_dep)
):
    image_service = ImageService(ImageRepo(db))
    return await image_service.list_images(current_user.id)

# @router.get("/diffuse", response_model=ImageCreate)