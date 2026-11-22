"""Client for a policy served over the Shakedown policy protocol."""

from __future__ import annotations

import uuid
from typing import Any

import httpx
import numpy as np

from shakedown.policies.base import Policy, PolicyError
from shakedown.policies.protocol import PROTOCOL_VERSION, encode_observation
from shakedown.types import Observation


class HttpPolicy(Policy):
    def __init__(self, url: str, timeout_s: float = 60.0, token: str | None = None):
        self.url = url.rstrip("/")
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        self._client = httpx.Client(base_url=self.url, timeout=timeout_s, headers=headers)
        self._episode = ""
        self._step = 0
        try:
            resp = self._client.get("/info")
            resp.raise_for_status()
            self._info = resp.json()
        except httpx.HTTPError as exc:
            raise PolicyError(f"could not reach policy server at {self.url}: {exc}") from exc
        version = self._info.get("protocol")
        if version != PROTOCOL_VERSION:
            raise PolicyError(
                f"policy server speaks protocol {version!r}, this client needs {PROTOCOL_VERSION}"
            )

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            resp = self._client.post(path, json=payload)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text[:500]
            raise PolicyError(
                f"policy server returned {exc.response.status_code} for {path}: {detail}"
            ) from exc
        except httpx.HTTPError as exc:
            raise PolicyError(f"policy server request to {path} failed: {exc}") from exc

    def reset(self, seed: int) -> None:
        self._episode = uuid.uuid4().hex
        self._step = 0
        self._post("/reset", {"episode_id": self._episode, "seed": seed})

    def act(self, obs: Observation) -> np.ndarray:
        body = self._post(
            "/act",
            {
                "episode_id": self._episode,
                "step": self._step,
                "observation": encode_observation(obs),
            },
        )
        self._step += 1
        action = body.get("action")
        if not isinstance(action, list) or not action:
            raise PolicyError(f"policy server returned no action: {body!r}")
        return np.asarray(action, dtype=np.float32)

    def configure(self, *, action_delay_steps: int = 0) -> None:
        # The protocol does not carry the delay. A served policy that compensates
        # for delay has to be configured on its own side.
        return None

    def describe(self) -> dict[str, Any]:
        return {"kind": "http", "url": self.url, "server": self._info}

    def close(self) -> None:
        self._client.close()
