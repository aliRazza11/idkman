from __future__ import annotations
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User

class UserRepo:
    def __init__(self, db: AsyncSession): self.db = db

    async def by_email(self, email: str) -> User|None:
        print(" db issue here")
        res = await self.db.execute(select(User).where(User.email == email))
        return res.scalar_one_or_none()

    async def create(self, email: str, username: str, password_hash: str) -> User:
        print(" db issue here")
        user = User(email=email, username=username, password_hash=password_hash)
        self.db.add(user)
        await self.db.commit()   # <- actually saves to DB
        await self.db.refresh(user)  # <- reloads the user with id, created_at, etc.
        return user
