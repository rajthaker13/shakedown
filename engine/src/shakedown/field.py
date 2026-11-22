"""Report what happens on real robots, and ask which release to run.

    from shakedown.field import FieldClient

    client = FieldClient()                 # SHAKEDOWN_URL and SHAKEDOWN_API_KEY
    release = client.release("fleet")

    with client.episode(release=release, robot="arm-03") as episode:
        while not done:
            with episode.inference():
                action = policy(observation)
            observation, done = robot.step(action)
            episode.frame(observation.image)
        episode.finish(success=succeeded, intervention=human_stepped_in)

Reporting must never stop a robot. Failures to reach the server are kept in
memory and retried with the next report; they do not raise.
"""

from __future__ import annotations

import logging
import os
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import httpx
import numpy as np

log = logging.getLogger(__name__)


class FieldError(RuntimeError):
    pass


@dataclass(frozen=True)
class Release:
    number: int
    stage: str
    policy_label: str
    policy_spec: str
    runtime_config: dict[str, Any]


@dataclass
class Episode:
    """One attempt at the task, being measured."""

    client: FieldClient
    policy_label: str
    release: int | None = None
    robot: str = ""
    site: str = ""
    control_hz: float | None = None
    simulated: bool = False
    id: str = field(default_factory=lambda: uuid.uuid4().hex)

    def __post_init__(self) -> None:
        self._started = time.time()
        self._started_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        self._inference_s: list[float] = []
        self._brightness: list[float] = []
        self._steps = 0
        self._dropped = 0
        self._delay_ms: float | None = None
        self._finished = False

    @contextmanager
    def inference(self):
        """Time one call to the policy."""
        started = time.perf_counter()
        try:
            yield
        finally:
            self._inference_s.append(time.perf_counter() - started)
            self._steps += 1

    def step(self, inference_ms: float | None = None) -> None:
        """Count a control step, for loops that time inference themselves."""
        self._steps += 1
        if inference_ms is not None:
            self._inference_s.append(inference_ms / 1000.0)

    def frame(self, image: np.ndarray | None) -> None:
        """Record a camera frame. Pass None when a frame was expected and did not arrive."""
        if image is None:
            self._dropped += 1
            return
        # A sparse sample is enough for a mean and keeps this cheap at camera rate.
        self._brightness.append(float(np.asarray(image)[::8, ::8].mean()))

    def action_delay(self, milliseconds: float) -> None:
        """The delay between choosing an action and the robot acting on it, if you measure it."""
        self._delay_ms = float(milliseconds)

    def finish(
        self,
        *,
        success: bool,
        intervention: bool = False,
        intervention_reason: str = "",
        note: str = "",
    ) -> None:
        if self._finished:
            return
        self._finished = True
        measured: dict[str, float | int] = {}
        if self._inference_s:
            measured["inference_ms"] = round(1000 * float(np.median(self._inference_s)), 2)
        if self._delay_ms is not None:
            measured["action_delay_ms"] = round(self._delay_ms, 2)
        if self.control_hz:
            measured["control_hz"] = float(self.control_hz)
        if self._brightness:
            measured["image_brightness"] = round(float(np.mean(self._brightness)), 2)
        if self._brightness or self._dropped:
            # Zero is a measurement too: leaving it out would hide the robots that drop none.
            measured["frames_dropped"] = self._dropped
        self.client.report(
            {
                "id": self.id,
                "policy_label": self.policy_label,
                "release": self.release,
                "robot": self.robot,
                "site": self.site,
                "success": bool(success),
                "intervention": bool(intervention),
                "intervention_reason": intervention_reason[:500],
                "note": note[:2000],
                "steps": self._steps or None,
                "duration_s": round(time.time() - self._started, 3),
                "measured": measured,
                "simulated": self.simulated,
                "started_at": self._started_at,
            }
        )

    def __enter__(self) -> Episode:
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        if not self._finished:
            # The loop ended without a verdict: an exception, or a forgotten call.
            self.finish(
                success=False,
                note=f"ended without a result: {exc_type.__name__}"
                if exc_type
                else "ended without a result",
            )


class FieldClient:
    def __init__(
        self,
        url: str | None = None,
        api_key: str | None = None,
        *,
        timeout_s: float = 10.0,
        max_pending: int = 5000,
    ):
        self.url = (url or os.environ.get("SHAKEDOWN_URL") or "").rstrip("/")
        self.api_key = api_key or os.environ.get("SHAKEDOWN_API_KEY") or ""
        if not self.url or not self.api_key:
            raise FieldError("set SHAKEDOWN_URL and SHAKEDOWN_API_KEY, or pass url and api_key")
        self._http = httpx.Client(
            base_url=f"{self.url}/api/v1",
            timeout=timeout_s,
            headers={"Authorization": f"Bearer {self.api_key}", "User-Agent": "shakedown-field"},
        )
        self._pending: list[dict[str, Any]] = []
        self._max_pending = max_pending
        #: Reports the server refused, with the reason. They are not retried.
        self.rejected: list[tuple[str, str]] = []

    def release(self, channel: str = "fleet") -> Release | None:
        """The release robots on this channel should run, or None if there is none."""
        try:
            response = self._http.get("/release", params={"channel": channel})
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise FieldError(f"could not ask for the {channel} release: {exc}") from exc
        data = response.json().get("release")
        if not data:
            return None
        return Release(
            number=data["number"],
            stage=data["stage"],
            policy_label=data["policy_label"],
            policy_spec=data["policy_spec"],
            runtime_config=data.get("runtime_config") or {},
        )

    def episode(
        self,
        *,
        release: Release | None = None,
        policy_label: str | None = None,
        robot: str = "",
        site: str = "",
        control_hz: float | None = None,
        simulated: bool = False,
    ) -> Episode:
        label = policy_label or (release.policy_label if release else None)
        if not label:
            raise FieldError("give a release or a policy_label")
        return Episode(
            client=self,
            policy_label=label,
            release=release.number if release else None,
            robot=robot,
            site=site,
            control_hz=control_hz,
            simulated=simulated,
        )

    def report(self, episode: dict[str, Any]) -> bool:
        """Send one report, with any that could not be sent earlier. Never raises."""
        self._pending.append(episode)
        del self._pending[: -self._max_pending]
        return self.flush()

    def flush(self) -> bool:
        """Send what is waiting. True when nothing is left to send and nothing was refused."""
        clean = True
        while self._pending:
            batch = self._pending[:500]
            status, detail = self._send(batch)
            if status is None or status >= 500 or status == 429:
                log.warning("field reports not sent (%s), will retry", detail)
                return False
            if status >= 400 and len(batch) > 1:
                # One report in the batch is unacceptable. Send them one at a time
                # so that the rest are not lost with it.
                for report in batch:
                    one, why = self._send([report])
                    if one is None or one >= 500 or one == 429:
                        return False
                    if one >= 400:
                        self.rejected.append((report.get("id", ""), why))
                        clean = False
                    self._pending.remove(report)
                continue
            if status >= 400:
                self.rejected.append((batch[0].get("id", ""), detail))
                log.error("field report refused: %s", detail)
                clean = False
            del self._pending[: len(batch)]
        return clean

    def _send(self, batch: list[dict[str, Any]]) -> tuple[int | None, str]:
        try:
            response = self._http.post("/field/episodes", json={"episodes": batch})
        except httpx.HTTPError as exc:
            return None, str(exc)
        if response.status_code < 400:
            return response.status_code, ""
        try:
            detail = response.json().get("error", response.text)
        except ValueError:
            detail = response.text
        return response.status_code, str(detail)[:300]

    @property
    def pending(self) -> int:
        return len(self._pending)

    def close(self) -> None:
        self.flush()
        self._http.close()
