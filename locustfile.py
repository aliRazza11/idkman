# locustfile.py
# Load test for FastAPI backend:
#  - /auth/signup, /auth/login, /auth/me, /auth/logout
#  - /diffuse
#  - /images [upload, list, get, delete]
#
# Run:
#   locust -H http://localhost:8000
#
# Notes:
# - Each simulated user signs up once (unique email/username), then stays logged in via cookies.
# - Requests are tagged so you can filter in Locust UI.

import base64
import io
import os
import random
import string
import time
from dataclasses import dataclass
from typing import Optional

from locust import HttpUser, task, between, tag

try:
    from PIL import Image
except Exception:
    Image = None  # If Pillow isn't available, we'll fall back to a tiny hardcoded PNG


# -------- Helpers -------- #

def _rand_suffix(n=6) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


def make_test_image_bytes() -> bytes:
    """
    Create a small JPEG image in-memory for upload and diffusion.
    Uses Pillow if available; otherwise returns a tiny 1x1 PNG byte payload.
    """
    if Image:
        img = Image.new("RGB", (64, 64), (random.randint(0, 255), 128, 180))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
        return buf.getvalue()
    # 1x1 transparent PNG
    return base64.b64decode(
        b"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMA"
        b"AQJr6n8AAAAASUVORK5CYII="
    )


def to_data_url(img_bytes: bytes, mime="image/jpeg") -> str:
    b64 = base64.b64encode(img_bytes).decode("ascii")
    return f"data:{mime};base64,{b64}"


@dataclass
class Creds:
    email: str
    username: str
    password: str


# -------- Locust User -------- #

class FastAPIUser(HttpUser):
    wait_time = between(0.3, 1.2)

    def on_start(self):
        """
        Create a unique user, sign up (idempotent-ish), then log in to get auth cookies.
        """
        suffix = _rand_suffix()
        self.creds = Creds(
            email=f"load_{suffix}@example.com",
            username=f"loaduser_{suffix}",
            password="testpassword123!",
        )
        self._signup_then_login()
        # Pre-build test image bytes to reuse across tasks
        self._img_bytes = make_test_image_bytes()
        self._img_data_url = to_data_url(self._img_bytes, mime="image/jpeg")
        self._last_uploaded_image_id: Optional[int] = None

    # ---------- Auth tasks ---------- #

    def _signup_then_login(self):
        # Signup
        with self.client.post(
            "/auth/signup",
            json={
                "email": self.creds.email,
                "username": self.creds.username,
                "password": self.creds.password,
            },
            name="auth:signup",
            catch_response=True,
        ) as resp:
            # If already exists, that’s fine; we’ll just log in.
            if resp.status_code not in (200, 201, 409, 422):
                resp.failure(f"Unexpected signup status {resp.status_code}: {resp.text}")

        # Login
        with self.client.post(
            "/auth/login",
            json={"email": self.creds.email, "password": self.creds.password},
            name="auth:login",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"Login failed: {resp.status_code} {resp.text}")

        # Verify /auth/me
        self.check_me()

    @tag("auth")
    @task(1)
    def check_me(self):
        with self.client.get("/auth/me", name="auth:me", catch_response=True) as resp:
            if resp.status_code != 200:
                resp.failure(f"/auth/me failed: {resp.status_code} {resp.text}")

    @tag("auth")
    @task(0)  # rarely call logout during load; cookies would clear
    def logout(self):
        with self.client.post("/auth/logout", name="auth:logout", catch_response=True) as resp:
            if resp.status_code != 200:
                resp.failure(f"/auth/logout failed: {resp.status_code} {resp.text}")
        # Immediately log back in so the user continues to be authenticated
        self._signup_then_login()

    # ---------- Images tasks ---------- #

    @tag("images")
    @task(2)
    def images_list(self):
        with self.client.get("/images", name="images:list", catch_response=True) as resp:
            if resp.status_code != 200:
                resp.failure(f"List images failed: {resp.status_code} {resp.text}")
                return
            data = resp.json()
            # Track one image id if present for get/delete
            if isinstance(data, list) and data:
                self._last_uploaded_image_id = data[0].get("id")

    @tag("images")
    @task(2)
    def images_upload(self):
        # multipart/form-data
        files = {
            "file": (
                f"test_{_rand_suffix()}.jpg",
                self._img_bytes,
                "image/jpeg",
            )
        }
        with self.client.post("/images", files=files, name="images:upload", catch_response=True) as resp:
            if resp.status_code not in (200, 201):
                resp.failure(f"Upload failed: {resp.status_code} {resp.text}")
                return
            data = resp.json()
            if "id" in data:
                self._last_uploaded_image_id = data["id"]

    @tag("images")
    @task(1)
    def images_get_and_maybe_delete(self):
        if not self._last_uploaded_image_id:
            return
        img_id = self._last_uploaded_image_id

        # GET bytes
        with self.client.get(f"/images/{img_id}", name="images:get", catch_response=True) as resp:
            if resp.status_code != 200:
                resp.failure(f"Get image failed: {resp.status_code} {resp.text}")

        # 30% chance: delete it
        if random.random() < 0.3:
            with self.client.delete(f"/images/{img_id}", name="images:delete", catch_response=True) as resp:
                if resp.status_code not in (200, 204):
                    resp.failure(f"Delete image failed: {resp.status_code} {resp.text}")
                else:
                    self._last_uploaded_image_id = None

    # ---------- Diffusion task ---------- #

    @tag("diffuse")
    @task(2)
    def diffuse(self):
        """
        Hit /diffuse with a small number of steps to keep it light.
        """
        payload = {
            "image_b64": self._img_data_url,  # your API accepts raw b64 or data URL
            "steps": random.randint(5, 15),
            "schedule": random.choice(["linear", "cosine"]),
            "seed": random.randint(0, 10_000),
            "return_data_url": True,
            # beta_start / beta_end omitted to use defaults
        }
        with self.client.post("/diffuse", json=payload, name="diffuse:run", catch_response=True) as resp:
            if resp.status_code != 200:
                resp.failure(f"Diffuse failed: {resp.status_code} {resp.text}")
            else:
                # Optionally validate response structure
                data = resp.json()
                if "image" not in data or "t" not in data:
                    resp.failure(f"Unexpected diffuse response: {data}")
