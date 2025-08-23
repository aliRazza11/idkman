# app/api/images.py
from fastapi import APIRouter, Depends, Request, status, UploadFile, File, HTTPException
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.db.session import get_db
from app.schemas.image import ImageCreate, ImageOut
from app.repositories.image_repo import ImageRepo
from app.services.image_service import ImageService
from app.services.auth_service import AuthService
from app.models.user import User
from app.repositories.user_repo import UserRepo

router = APIRouter(prefix="/images", tags=["Images"])

async def get_current_user_dep(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    auth_service = AuthService(UserRepo(db))
    return await auth_service.get_current_user(request)

@router.post("", response_model=ImageOut, status_code=status.HTTP_201_CREATED)
async def upload_image(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_dep),
):
    contents = await file.read()
    image_in = ImageCreate(
        image_data=contents,
        filename=file.filename or "upload",
        content_type=file.content_type or "application/octet-stream",
    )
    svc = ImageService(ImageRepo(db))
    return await svc.create_image(image_in, current_user.id)

@router.get("", response_model=List[ImageOut])
async def list_user_images(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_dep)
):
    svc = ImageService(ImageRepo(db))
    return await svc.list_images(current_user.id)

@router.get("/{image_id}")
async def get_image_bytes(
    image_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_dep)
):
    svc = ImageService(ImageRepo(db))
    img = await svc.get_user_image(image_id, current_user.id)
    if not img:
        raise HTTPException(status_code=404, detail="Not found")
    return Response(content=img.image_data, media_type=img.content_type,
                    headers={"Content-Disposition": f'inline; filename="{img.filename}"'})

@router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_image(
    image_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_dep)
):
    svc = ImageService(ImageRepo(db))
    img = await svc.get_user_image(image_id, current_user.id)
    if not img:
        raise HTTPException(status_code=404, detail="Not found")
    await svc.delete_image(img)
    return Response(status_code=204)
