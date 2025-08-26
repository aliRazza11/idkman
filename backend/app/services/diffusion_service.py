from fastapi import WebSocket
from app.domain.Diffusion import Diffusion
from app.schemas.diffusion import DiffuseRequest, DiffuseResponse, WSStartPayload
from app.domain.Diffusion import Diffusion
from app.domain.ImageProcessor import ImageProcessor
import asyncio, json


_last_beta_array: list[float] = []

def get_last_beta_array() -> list[float]:
    return _last_beta_array

class DiffusionService:

    @staticmethod
    def run_diffusion(req: DiffuseRequest) -> DiffuseResponse:
        inst = Diffusion(
            encoded_img=req.image_b64,
            steps=req.steps,
            beta_start=req.beta_start,
            beta_end=req.beta_end,
            beta_schedule=req.schedule,
            seed=req.seed,
            max_side=256,  # protect server from huge uploads
        )
        global _last_beta_array
        _last_beta_array.clear()

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
            image_out = inst.fast_diffuse_base64(
                t,
                data_url=False,
                format="JPEG",
                quality=92
            )
        _last_beta_array = inst.beta.tolist()
        print(_last_beta_array)
        return DiffuseResponse(image=image_out, t=t)


class DiffuseWSService:
    @staticmethod
    async def run_diffusion(ws: WebSocket, payload: WSStartPayload):
        inst = Diffusion(
            encoded_img=payload.image_b64,
            steps=payload.steps,
            beta_start=payload.beta_start,
            beta_end=payload.beta_end,
            beta_schedule=payload.schedule,
            seed=payload.seed,
            max_side=512,
        )
        global _last_beta_array
        _last_beta_array.clear()
        steps = payload.steps
        stride = max(1, payload.preview_every)

        last_encoded = None
        last_metrics = None
        beta = None

        for t, beta, frame in inst.frames():
            if (t % stride) == 0 or (t == steps - 1):
                encoded = (
                    ImageProcessor.array_to_data_url(
                        frame, format="JPEG", quality=payload.quality
                    )
                    if payload.data_url
                    else ImageProcessor.array_to_base64(
                        frame, format="JPEG", quality=payload.quality
                    )
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
                last_metrics = metrics

                msg = {
                    "t": t,
                    "beta": beta,
                    "step": t + 1,
                    "progress": (t + 1) / steps,
                    "image": encoded,
                }
                if metrics is not None:
                    msg["metrics"] = metrics

                await ws.send_text(json.dumps(msg))

            await asyncio.sleep(0)
            _last_beta_array.append(beta)

        await ws.send_text(json.dumps({
            "status": "done",
            "t": steps - 1,
            "beta": beta,
            "step": steps,
            "progress": 1.0,
            "image": last_encoded,
            **({"metrics": last_metrics} if last_metrics is not None else {}),
        }))
        await ws.close()
 