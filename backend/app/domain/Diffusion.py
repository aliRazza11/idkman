from __future__ import annotations
import logging
from typing import Generator, Iterable, Optional, Tuple

import numpy as np

from app.domain.ImageProcessor import ImageProcessor
from app.domain.BetaScheduler import BetaScheduler

logger = logging.getLogger(__name__)


def _uint8_from_float01(x: np.ndarray) -> np.ndarray:
    return (np.clip(x, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)


def _mix_seed(seed: int, t: int) -> int:
    # Simple deterministic mix for per-t RNG (stateless fast calls)
    return (seed ^ (t * 0x9E3779B1)) & 0xFFFFFFFF


class Diffusion:
    """
    Forward diffusion utilities for an image. Designed for UI sliders:
    - fast_diffuse(t): O(1) time per t (no iterative loop)
    - diffuse_at_t(t): iterative semantics (matches Markov chain)
    - frames(): generator across t steps (stream to client)
    """

    def __init__(
        self,
        encoded_img: str,
        steps: int,
        beta_start: float,
        beta_end: float,
        beta_schedule: str = "linear",
        *,
        seed: Optional[int] = None,
        max_side: Optional[int] = 256,
    ):
        if not (1 <= steps <= 1000):
            raise ValueError("steps must be in [1, 1000]")

        # Decode (optionally resize for safety/perf)
        ip = ImageProcessor(encoded_img)
        img = ip.decode_image(max_side=max_side)  # HxWx3 uint8
        self._ip = ip  # keep for encoding helpers

        # Normalize once; keep float32
        self.x0 = (img.astype(np.float32) / 255.0).clip(0.0, 1.0)
        self.img_shape = self.x0.shape

        # Build schedule (precomputes all derived arrays)
        sched = BetaScheduler(steps, beta_schedule, beta_start, beta_end)
        self.steps = steps
        self.beta = sched.get_beta()                                  # (T,)
        self.alpha = sched.get_alpha()                                # (T,)
        self.alpha_bar = sched.get_alpha_bar()                        # (T,)
        self.sqrt_alpha_bar = sched.get_all().sqrt_alpha_bar          # (T,)
        self.sqrt_one_minus_alpha_bar = sched.get_all().sqrt_one_minus_alpha_bar  # (T,)
        self.sqrt_one_minus_beta = sched.get_all().sqrt_one_minus_beta  # (T,)

        # RNG: default deterministic per process; for stateless calls we derive per-t RNG
        self._base_seed = int(seed if seed is not None else np.random.SeedSequence().entropy)

        logger.info("Diffusion init: shape=%s, steps=%d, schedule=%s",
                    self.img_shape, self.steps, beta_schedule)

    # ---------- Public APIs ----------

    def fast_diffuse(self, t: int) -> np.ndarray:
        """
        x_t = sqrt(alpha_bar[t]) * x0 + sqrt(1 - alpha_bar[t]) * eps
        O(1) time; ideal for UI slider jumping around.
        """
        t = self._clamp_t(t)
        rng = np.random.default_rng(_mix_seed(self._base_seed, t))
        eps = rng.normal(size=self.img_shape, loc=0.0, scale=1.0).astype(np.float32)
        xt = self.sqrt_alpha_bar[t] * self.x0 + self.sqrt_one_minus_alpha_bar[t] * eps
        return _uint8_from_float01(xt)

    def fast_diffuse_base64(
        self,
        t: int,
        *,
        format: str = "JPEG",
        quality: int = 90,
        data_url: bool = False,
    ) -> str:
        arr = self.fast_diffuse(t)
        if data_url:
            return ImageProcessor.array_to_data_url(arr, format=format, quality=quality)
        return ImageProcessor.array_to_base64(arr, format=format, quality=quality)

    def diffuse_at_t(self, t: int) -> np.ndarray:
        """
        Iterative DDPM forward process:
        x_{i+1} = sqrt(1 - beta_i) * x_i + sqrt(beta_i) * eps_i
        Recomputes from x0 each call; use for exact chain semantics.
        """
        t = self._clamp_t(t)
        rng = np.random.default_rng(_mix_seed(self._base_seed, t))  # seed per-t for determinism
        xt = self.x0
        for i in range(t + 1):
            eps = rng.normal(size=self.img_shape, loc=0.0, scale=1.0).astype(np.float32)
            xt = self.sqrt_one_minus_beta[i] * xt + np.sqrt(self.beta[i], dtype=np.float32) * eps
        return _uint8_from_float01(xt)

    def frames(self) -> Generator[Tuple[int, np.ndarray], None, None]:
        """
        Stream frames for t=0..T-1 using iterative updates.
        Useful for precomputation server-side or long-poll streaming.
        """

        rng = np.random.default_rng()
        xt = self.x0
        for i in range(self.steps):
            eps = rng.normal(size=self.img_shape, loc=0.0, scale=1.0).astype(np.float32)
            xt = self.sqrt_one_minus_beta[i] * xt + np.sqrt(self.beta[i], dtype=np.float32) * eps
            print(self._compute_metrics(xt, self.x0)['Cosine'])
            yield i, float(self.beta[i]), _uint8_from_float01(xt)

    def compute_metrics(self, xt: np.ndarray, xt0: np.ndarray) -> dict:
        """
        Compute degradation metrics between noisy image xt and original x0.
        xt is uint8 HxWx3
        """
        return 0
        

    # ---------- Helpers ----------
    def _clamp_t(self, t: int) -> int:
        if not isinstance(t, (int, np.integer)):
            raise TypeError("t must be an integer")
        if t < 0 or t >= self.steps:
            logger.warning("t=%s out of bounds, clamping to [0, %d)", t, self.steps)
            t = int(np.clip(t, 0, self.steps - 1))
        return int(t)
    
    def _compute_metrics(self, xt1: np.ndarray, xt0: np.ndarray) -> dict:
        def _ssim_manual(x: np.ndarray, y: np.ndarray, L: int = 255) -> float:
            # Convert to float
            x = x.astype(np.float64)
            y = y.astype(np.float64)

            mu_x = x.mean()
            mu_y = y.mean()
            sigma_x = x.var()
            sigma_y = y.var()
            sigma_xy = ((x - mu_x) * (y - mu_y)).mean()

            C1 = (0.01 * L) ** 2
            C2 = (0.03 * L) ** 2

            return ((2 * mu_x * mu_y + C1) * (2 * sigma_xy + C2)) / \
                ((mu_x**2 + mu_y**2 + C1) * (sigma_x + sigma_y + C2))

        def _cosine_similarity(x: np.ndarray, y: np.ndarray) -> float:
            x = x.astype(np.float64).ravel()
            y = y.astype(np.float64).ravel()
            return np.dot(x, y) / (np.linalg.norm(x) * np.linalg.norm(y))
        
        return {
            "SSIM": _ssim_manual(xt0, xt1),
            "Cosine": _cosine_similarity(xt0, xt1)
        }