from __future__ import annotations
import base64
import logging
from dataclasses import dataclass
from io import BytesIO
from typing import Optional, Tuple

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


def _strip_data_url_prefix(b64: str) -> str:
    # Accept both raw base64 and data URLs: data:image/png;base64,XXXX
    if "," in b64 and b64.strip().lower().startswith("data:"):
        return b64.split(",", 1)[1]
    return b64


@dataclass
class ImageProcessor:
    """
    Small utility for decoding/encoding base64 images and basic validation.
    """
    encoded_img: str
    _decoded_image: Optional[np.ndarray] = None  # HxWxC uint8

    # ---------- Decode ----------
    def _decode_image(self, encoded_img: str) -> np.ndarray:
        try:
            raw = base64.b64decode(_strip_data_url_prefix(encoded_img), validate=True)
            with Image.open(BytesIO(raw)) as im:
                # Normalize to RGB to keep the rest of the pipeline simple.
                im = im.convert("RGB")
                arr = np.asarray(im, dtype=np.uint8)
            logger.debug("Image decoded: shape=%s, dtype=%s", arr.shape, arr.dtype)
            return arr
        except Exception as e:
            logger.error("Image decoding failed: %s", e)
            raise ValueError(f"Invalid image data: {e}")

    def decode_image(
        self,
        *,
        max_side: Optional[int] = None,
    ) -> np.ndarray:
        """
        Decode to HxWx3 uint8; optionally downscale preserving aspect ratio.
        """
        img = self._decode_image(self.encoded_img)
        if max_side is not None and max_side > 0:
            h, w = img.shape[:2]
            m = max(h, w)
            if m > max_side:
                scale = max_side / float(m)
                new_size = (max(int(w * scale), 1), max(int(h * scale), 1))
                with Image.fromarray(img) as im:
                    im = im.resize(new_size, resample=Image.LANCZOS)
                    img = np.asarray(im, dtype=np.uint8)
                logger.debug("Image resized to: %s", img.shape)
        self._decoded_image = img
        return img


    # ---------- Introspection ----------
    def get_shape(self) -> Tuple[int, int, int]:
        if self._decoded_image is None:
            raise RuntimeError("Image not decoded yet. Call decode_image() first.")
        return self._decoded_image.shape

    # ---------- Encode helpers (useful for API responses) ----------
    @staticmethod
    def array_to_base64(
        arr: np.ndarray,
        format: str = "JPEG",
        quality: int = 90,
    ) -> str:
        """
        Encode an HxWx{1,3} uint8 numpy array to raw base64 (no data URL prefix).
        """
        if arr.ndim == 2:
            mode = "L"
            pil = Image.fromarray(arr, mode=mode)
        elif arr.ndim == 3 and arr.shape[2] in (1, 3):
            if arr.shape[2] == 1:
                pil = Image.fromarray(arr.squeeze(-1), mode="L")
                format = "PNG"  # safer for single-channel if caller didn't specify
            else:
                pil = Image.fromarray(arr, mode="RGB")
        else:
            raise ValueError("Expected HxW or HxWx{1,3} uint8 array.")
        buff = BytesIO()
        save_kwargs = {}
        if format.upper() == "JPEG":
            save_kwargs["quality"] = int(quality)
            save_kwargs["optimize"] = True
        pil.save(buff, format=format)
        return base64.b64encode(buff.getvalue()).decode("utf-8")

    @staticmethod
    def array_to_data_url(
        arr: np.ndarray,
        format: str = "JPEG",
        quality: int = 90,
    ) -> str:
        mime = {
            "JPEG": "image/jpeg",
            "JPG": "image/jpeg",
            "PNG": "image/png",
            "WEBP": "image/webp",
        }.get(format.upper(), "application/octet-stream")
        b64 = ImageProcessor.array_to_base64(arr, format=format, quality=quality)
        return f"data:{mime};base64,{b64}"

def main():
    import matplotlib.pyplot as plt
    import base64

    # safer path
    with open("backend/_tests/images/img97.jpg", "rb") as f:
        img_bytes = f.read()  # read all bytes
        img_b64 = base64.b64encode(img_bytes).decode("utf-8")

    ip = ImageProcessor(img_b64)
    img2 = ip.decode_image(max_side=28)
    plt.imshow(img2)
    plt.show()


if __name__=="__main__":
    main()