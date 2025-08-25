from pydantic import AnyUrl
from pydantic_settings import BaseSettings
from typing import Optional
from dotenv import load_dotenv
import os


class Settings(BaseSettings):
    APP_NAME: str = "Forward Diffusion API"
    ENV: str = "dev"
    FRONTEND_ORIGIN: str = "http://localhost:5173"  # your React dev
    DATABASE_URL: str = "mysql+aiomysql://root:1234@localhost:3306/diffusiondb"
    JWT_SECRET: str = "hello"
    JWT_ALG: str = "HS256"
    ACCESS_TOKEN_TTL_MIN: int = 40
    REFRESH_TOKEN_TTL_DAYS: int = 7
    COOKIE_DOMAIN: Optional[str] = None  # set in prod (e.g., .yourdomain.com)
    SECURE_COOKIES: bool = False          # True in prod over HTTPS

    class Config:
        env_file = ".env"

settings = Settings()
