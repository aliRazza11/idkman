# app/routers/diffuse_ws.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from typing import Literal, Optional
import asyncio, json

from app.domain.Diffusion import Diffusion
from app.domain.ImageProcessor import ImageProcessor

router = APIRouter(prefix="/diffuse", tags=["diffusion"])

class WSStartPayload(BaseModel):
    image_b64: str = Field(..., description="data URL or raw base64")
    steps: int = Field(..., ge=1, le=1000)
    schedule: Literal["linear", "cosine"] = "linear"
    seed: Optional[int] = None

    # ✅ Properly-typed, validated fields (defaults provided)
    beta_start: float = Field(1e-3, ge=1e-8, le=0.5)
    beta_end: float = Field(2e-2, ge=1e-8, le=0.5)

    preview_every: int = Field(1, ge=1, description="Emit a preview every N steps")
    quality: int = Field(85, ge=1, le=100)
    data_url: bool = True
    include_metrics: bool = False

@router.websocket("/ws")
async def diffuse_ws(ws: WebSocket):
    await ws.accept()
    task: Optional[asyncio.Task] = None
    try:
        start_msg = await ws.receive_json()
        payload = WSStartPayload(**start_msg)

        # ✅ Pass beta_start / beta_end to Diffusion
        inst = Diffusion(
            encoded_img=payload.image_b64,
            steps=payload.steps,
            beta_start=payload.beta_start,
            beta_end=payload.beta_end,
            beta_schedule=payload.schedule,
            seed=payload.seed,
            max_side=512,
        )

        async def run_diffusion():
            steps = payload.steps
            stride = max(1, payload.preview_every)

            last_encoded = None
            last_metrics = None

            for t, frame in inst.frames():
                if (t % stride) == 0 or (t == steps - 1):
                    encoded = (
                        ImageProcessor.array_to_data_url(frame, format="JPEG", quality=payload.quality)
                        if payload.data_url
                        else ImageProcessor.array_to_base64(frame, format="JPEG", quality=payload.quality)
                    )

                    metrics = None
                    if payload.include_metrics:
                        try:
                            metrics = inst._compute_metrics(
                                frame, (inst.x0 * 255.0 + 0.5).astype("uint8")
                            )
                        except Exception:
                            metrics = None

                    last_encoded = encoded

                    msg = {
                        "t": t,
                        "step": t + 1,
                        "progress": (t + 1) / steps,
                        "image": encoded,
                    }
                    if metrics is not None:
                        msg["metrics"] = metrics

                    await ws.send_text(json.dumps(msg))
                await asyncio.sleep(0)

            await ws.send_text(json.dumps({
                "status": "done",
                "t": steps - 1,
                "step": steps,
                "progress": 1.0,
                "image": last_encoded,
                **({"metrics": last_metrics} if last_metrics is not None else {}),
            }))
            await ws.close()

        task = asyncio.create_task(run_diffusion())

        while True:
            other = await ws.receive_text()
            try:
                cmd = json.loads(other)
                if cmd.get("action") == "cancel" and task and not task.done():
                    task.cancel()
                    await ws.send_text(json.dumps({"status": "canceled"}))
                    await ws.close()
                    break
            except Exception:
                pass

    except WebSocketDisconnect:
        if task and not task.done():
            task.cancel()
    except asyncio.CancelledError:
        pass
    except Exception as e:
        try:
            await ws.send_text(json.dumps({"status": "error", "detail": str(e)}))
        finally:
            await ws.close()
