"""Perturbation registry.

A perturbation is a controlled change to the conditions a policy runs under.
There are two kinds:

* `sim` perturbations change the simulated world (lighting, camera pose,
  object pose, physics). Each environment adapter implements the ones it
  supports.
* `io` perturbations change what crosses the boundary between the policy and
  the world (image noise, latency, dropped frames). They are implemented
  once, here, and work with every environment.
"""

from __future__ import annotations

from typing import Any, ClassVar, Literal

import numpy as np
from pydantic import BaseModel, ConfigDict

from shakedown.types import Observation

Kind = Literal["sim", "io"]


class Perturbation(BaseModel):
    """Base class. Subclasses declare their parameters as pydantic fields."""

    model_config = ConfigDict(extra="forbid")

    name: ClassVar[str]
    kind: ClassVar[Kind]
    summary: ClassVar[str] = ""

    def describe(self) -> str:
        params = self.model_dump(exclude_defaults=True)
        if not params:
            return self.name
        inner = ", ".join(f"{k}={v}" for k, v in params.items())
        return f"{self.name}({inner})"


class IoPerturbation(Perturbation):
    """Perturbation applied to observations or actions, independent of the simulator."""

    kind: ClassVar[Kind] = "io"

    def begin_episode(self, rng: np.random.Generator) -> None:
        """Reset any per-episode state. Called before the first step."""

    def transform_observation(
        self, obs: Observation, rng: np.random.Generator, step: int
    ) -> Observation:
        return obs

    def transform_action(
        self, action: np.ndarray, rng: np.random.Generator, step: int
    ) -> np.ndarray:
        return action


class SimPerturbation(Perturbation):
    """Perturbation applied inside the simulator by the environment adapter."""

    kind: ClassVar[Kind] = "sim"


_REGISTRY: dict[str, type[Perturbation]] = {}


def register(cls: type[Perturbation]) -> type[Perturbation]:
    if not getattr(cls, "name", None):
        raise TypeError(f"{cls.__name__} must define a `name`")
    if cls.name in _REGISTRY:
        raise ValueError(f"perturbation '{cls.name}' is already registered")
    _REGISTRY[cls.name] = cls
    return cls


def registry() -> dict[str, type[Perturbation]]:
    return dict(_REGISTRY)


class PerturbationError(ValueError):
    pass


def build(spec: dict[str, dict[str, Any]]) -> Perturbation:
    """Build a perturbation from a single-key scenario entry."""
    if len(spec) != 1:
        raise PerturbationError(f"expected a single-key mapping, got {spec!r}")
    name, params = next(iter(spec.items()))
    cls = _REGISTRY.get(name)
    if cls is None:
        known = ", ".join(sorted(_REGISTRY))
        raise PerturbationError(f"unknown perturbation '{name}'. Known: {known}")
    try:
        return cls(**(params or {}))
    except Exception as exc:
        raise PerturbationError(f"{name}: {exc}") from exc


def build_all(specs: list[dict[str, dict[str, Any]]]) -> list[Perturbation]:
    return [build(s) for s in specs]
