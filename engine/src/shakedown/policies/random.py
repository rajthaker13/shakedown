"""Uniform random actions. A floor that any trained policy should clear."""

from __future__ import annotations

from typing import Any

import numpy as np

from shakedown.policies.base import Policy
from shakedown.types import Observation


class RandomPolicy(Policy):
    def __init__(self, action_dim: int, low: float = -1.0, high: float = 1.0):
        self.action_dim = action_dim
        self.low, self.high = low, high
        self._rng = np.random.default_rng(0)

    def reset(self, seed: int) -> None:
        self._rng = np.random.default_rng(seed)

    def act(self, obs: Observation) -> np.ndarray:
        return self._rng.uniform(self.low, self.high, size=self.action_dim).astype(np.float32)

    def describe(self) -> dict[str, Any]:
        return {"kind": "random", "action_dim": self.action_dim}
