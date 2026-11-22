"""Policy adapter interface and the policy spec parser.

A policy spec is a short string naming where a policy comes from:

    lerobot:path/or/hub-id             a LeRobot checkpoint, run in-process
    lerobot:path?n_action_steps=25     the same, with inference options
    http://host:8000                   a policy served over the Shakedown protocol
    random                             uniform random actions, a sanity baseline
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qsl

import numpy as np

from shakedown.types import Observation


class PolicyError(RuntimeError):
    pass


class Policy(ABC):
    @abstractmethod
    def reset(self, seed: int) -> None:
        """Clear any state carried between steps. Called before every episode."""

    @abstractmethod
    def act(self, obs: Observation) -> np.ndarray:
        """Return one action for the given observation."""

    def configure(self, *, action_delay_steps: int = 0) -> None:  # noqa: B027 - optional hook
        """Tell the policy about the conditions it is about to run under.

        `action_delay_steps` is the delay between an action being chosen and
        reaching the robot. A deployed policy knows this from measurement; a
        policy that compensates for delay needs it.
        """

    def describe(self) -> dict[str, Any]:
        return {}

    def close(self) -> None:
        return None


@dataclass(frozen=True)
class PolicySpec:
    kind: str
    target: str
    options: dict[str, str]
    raw: str


def _coerce(value: str) -> Any:
    low = value.lower()
    if low in ("true", "false"):
        return low == "true"
    if low in ("none", "null"):
        return None
    for cast in (int, float):
        try:
            return cast(value)
        except ValueError:
            continue
    return value


def parse_spec(raw: str) -> PolicySpec:
    raw = raw.strip()
    if not raw:
        raise PolicyError("empty policy spec")
    if raw.startswith(("http://", "https://")):
        return PolicySpec(kind="http", target=raw.rstrip("/"), options={}, raw=raw)
    if raw == "random":
        return PolicySpec(kind="random", target="", options={}, raw=raw)
    kind, sep, rest = raw.partition(":")
    if not sep:
        # A bare path or hub id is treated as a LeRobot checkpoint.
        kind, rest = "lerobot", raw
    target, _, query = rest.partition("?")
    if kind != "lerobot":
        raise PolicyError(
            f"unknown policy kind '{kind}'. Use lerobot:<checkpoint>, an http(s) URL, or 'random'"
        )
    if not target:
        raise PolicyError(f"policy spec '{raw}' names no checkpoint")
    return PolicySpec(kind=kind, target=target, options=dict(parse_qsl(query)), raw=raw)


def load_policy(
    raw: str, *, action_dim: int, device: str | None = None, token: str | None = None
) -> Policy:
    spec = parse_spec(raw)
    if spec.kind == "http":
        from shakedown.policies.http import HttpPolicy

        return HttpPolicy(spec.target, token=token)
    if spec.kind == "random":
        from shakedown.policies.random import RandomPolicy

        return RandomPolicy(action_dim)
    from shakedown.policies.lerobot import LeRobotPolicy

    options = {k: _coerce(v) for k, v in spec.options.items()}
    return LeRobotPolicy(spec.target, device=device, **options)
