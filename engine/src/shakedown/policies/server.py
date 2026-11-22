"""Reference server for the Shakedown policy protocol.

Serves any policy that Shakedown can load. Teams with their own inference
stack can copy the three routes here; the protocol is deliberately small.
"""

from __future__ import annotations

import hmac
import threading
from typing import Any

from pydantic import BaseModel

from shakedown.policies.base import Policy
from shakedown.policies.protocol import PROTOCOL_VERSION, decode_observation


# Defined at module level: FastAPI resolves annotations by name, and cannot
# see classes that are local to a function.
class ResetBody(BaseModel):
    episode_id: str
    seed: int


class ActBody(BaseModel):
    episode_id: str
    step: int
    observation: dict[str, Any]


def create_app(policy: Policy, name: str, action_dim: int | None, token: str | None = None):
    from fastapi import Depends, FastAPI, Header, HTTPException

    app = FastAPI(title="Shakedown policy server", version=str(PROTOCOL_VERSION))
    # A policy holds per-episode state (action queues, observation history), so
    # requests are served one at a time.
    lock = threading.Lock()
    state = {"episode": None}

    def authorize(authorization: str | None = Header(default=None)) -> None:
        if token is None:
            return
        given = (authorization or "").removeprefix("Bearer ").strip()
        if not hmac.compare_digest(given, token):
            raise HTTPException(status_code=401, detail="invalid or missing token")

    @app.get("/info", dependencies=[Depends(authorize)])
    def info() -> dict[str, Any]:
        return {
            "protocol": PROTOCOL_VERSION,
            "name": name,
            "action_dim": action_dim,
            "policy": policy.describe(),
        }

    @app.post("/reset", dependencies=[Depends(authorize)])
    def reset(body: ResetBody) -> dict[str, Any]:
        with lock:
            policy.reset(body.seed)
            state["episode"] = body.episode_id
        return {"ok": True}

    @app.post("/act", dependencies=[Depends(authorize)])
    def act(body: ActBody) -> dict[str, Any]:
        with lock:
            if state["episode"] != body.episode_id:
                raise HTTPException(
                    status_code=409,
                    detail="unknown episode_id; call /reset before /act",
                )
            action = policy.act(decode_observation(body.observation))
        return {"action": [float(x) for x in action]}

    return app
