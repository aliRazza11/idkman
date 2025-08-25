# app/routers/diffusion.py
from typing import Literal, Optional
from pydantic import BaseModel, Field, validator, field_validator
from fastapi import APIRouter, HTTPException

from app.domain.Diffusion import Diffusion

router = APIRouter(prefix="/diffuse", tags=["diffusion"])


class DiffuseRequest(BaseModel):
    image_b64: str = Field(..., description="Raw base64 or data URL: data:image/jpeg;base64,...")
    steps: int = Field(..., ge=1, le=1000)
    schedule: Literal["linear", "cosine"] = "linear"
    seed: Optional[int] = None

    # Optional override for beta range
    beta_start: Optional[float] = Field(None, ge=1e-8, le=0.001)
    beta_end: Optional[float] = Field(None, ge=1e-8, le=0.02)

    return_data_url: bool = True  # return data URL for easy <img src=...>

    @field_validator("image_b64")
    def not_empty(cls, v: str):
        if not v or len(v) < 16:
            raise ValueError("image_b64 looks invalid/empty")
        return v


class DiffuseResponse(BaseModel):
    image: str  # base64 or data URL depending on return_data_url
    t: int      # the timestep used


@router.post("", response_model=DiffuseResponse)
async def diffuse(req: DiffuseRequest):
    """
    Accepts base64/data-URL image + diffusion params and returns the diffused image.
    """
    try:
        inst = Diffusion(
            encoded_img=req.image_b64,
            steps=req.steps,
            beta_start=req.beta_start,
            beta_end=req.beta_end,
            beta_schedule=req.schedule,
            seed=req.seed,
            max_side=256,  # protect server from huge uploads
        )

        # For now: just return the final step (t = steps-1)
        t = req.steps - 1

        if req.return_data_url:
            image_out = inst.fast_diffuse_base64(
                t,
                data_url=True,
                format="JPEG",
                quality=92,
            )
        else:
            image_out = inst.fast_diffuse_base64(t, data_url=False, format="JPEG", quality=92)

        return DiffuseResponse(image=image_out, t=t)

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Diffusion failed: {e}")
