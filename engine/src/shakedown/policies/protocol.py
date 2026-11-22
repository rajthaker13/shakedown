"""Wire format of the Shakedown policy protocol, version 1.

The protocol lets a team test a policy without handing over its weights.
They run a small HTTP server next to the policy; Shakedown drives the
simulator and sends observations to it.

    GET  /info    -> {"protocol": 1, "name": str, "action_dim": int, ...}
    POST /reset   {"episode_id": str, "seed": int}              -> {"ok": true}
    POST /act     {"episode_id": str, "step": int,
                   "observation": {"images": {name: <png, base64>},
                                   "state": [float, ...],
                                   "task": str}}                -> {"action": [float, ...]}

Images are sent as lossless PNG so that a served policy sees exactly the
pixels an in-process policy would.
"""

from __future__ import annotations

import base64
import io
from typing import Any

import numpy as np
from PIL import Image

from shakedown.types import Observation

PROTOCOL_VERSION = 1


def encode_image(img: np.ndarray) -> str:
    buf = io.BytesIO()
    Image.fromarray(img).save(buf, format="PNG", compress_level=1)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def decode_image(data: str) -> np.ndarray:
    raw = base64.b64decode(data)
    return np.asarray(Image.open(io.BytesIO(raw)).convert("RGB")).copy()


def encode_observation(obs: Observation) -> dict[str, Any]:
    return {
        "images": {name: encode_image(img) for name, img in obs.images.items()},
        "state": [float(x) for x in obs.state],
        "task": obs.task,
    }


def decode_observation(payload: dict[str, Any]) -> Observation:
    return Observation(
        images={name: decode_image(data) for name, data in payload.get("images", {}).items()},
        state=np.asarray(payload.get("state", []), dtype=np.float32),
        task=str(payload.get("task", "")),
    )
