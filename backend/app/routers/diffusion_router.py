from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from app.schemas.diffusion import DiffuseRequest, DiffuseResponse, WSStartPayload
from app.services.diffusion_service import DiffusionService, DiffuseWSService, get_last_beta_array
from typing import Optional
import asyncio, json



router = APIRouter(prefix="", tags=["diffusion"])


@router.post("/diffuse", response_model=DiffuseResponse)
async def diffuse(req: DiffuseRequest):
    """
    Accepts base64/data-URL image + diffusion params and returns the diffused image.
    """
    print("herte")
    try:
        return DiffusionService.run_diffusion(req)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Diffusion failed: {e}")

@router.get("/schedule")
async def schedule():
    array = get_last_beta_array()
    if array:
        return array
    else:
        raise HTTPException(status_code=400, detail="Please run diffusion to generate")

@router.websocket("/diffuse/ws")
async def diffuse_ws(ws: WebSocket):
    await ws.accept()
    task: Optional[asyncio.Task] = None
    try:
        start_msg = await ws.receive_json()
        payload = WSStartPayload(**start_msg)

        task = asyncio.create_task(DiffuseWSService.run_diffusion(ws, payload))

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
 