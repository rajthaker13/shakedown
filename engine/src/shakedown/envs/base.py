"""Environment adapter interface.

An adapter wraps one simulator task behind a small, uniform surface so the
runner, the perturbation library and the policy adapters never touch
simulator-specific code.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import ClassVar

import numpy as np

from shakedown.perturbations.base import SimPerturbation
from shakedown.types import Observation, StepResult


class UnsupportedPerturbation(ValueError):
    pass


class EnvAdapter(ABC):
    #: Registry id, e.g. "aloha/transfer_cube".
    id: ClassVar[str]
    #: Simulator backend, shown in reports.
    backend: ClassVar[str]
    fps: ClassVar[int]
    default_max_steps: ClassVar[int]
    #: Reward value that counts as full task success.
    max_reward: ClassVar[float]
    #: Names of the sim perturbations this adapter implements.
    supported: ClassVar[frozenset[str]] = frozenset()
    #: Natural-language instruction given to language-conditioned policies.
    task_description: ClassVar[str] = ""

    def __init__(self, perturbations: list[SimPerturbation] | None = None):
        self.perturbations = list(perturbations or [])
        for p in self.perturbations:
            if p.name not in self.supported:
                raise UnsupportedPerturbation(
                    f"environment '{self.id}' does not support '{p.name}'. "
                    f"Supported: {', '.join(sorted(self.supported)) or 'none'}"
                )

    @abstractmethod
    def reset(self, seed: int) -> Observation: ...

    @abstractmethod
    def step(self, action: np.ndarray) -> tuple[Observation, StepResult]: ...

    @abstractmethod
    def action_dim(self) -> int: ...

    def failure_label(self, max_reward: float, signals: dict[str, list[float]]) -> str:
        """Short description of how far a failed episode got."""
        return f"reached reward {max_reward:g} of {self.max_reward:g}"

    def close(self) -> None:
        return None


_ENVS: dict[str, type[EnvAdapter]] = {}


def register_env(cls: type[EnvAdapter]) -> type[EnvAdapter]:
    _ENVS[cls.id] = cls
    return cls


#: Built-in adapters, keyed by the prefix of the environment ids they provide.
#: Each module is imported only when one of its environments is asked for.
_BUILTIN = {
    "aloha/": "shakedown.envs.aloha",
    "pusht": "shakedown.envs.pusht",
}


def _load(module: str) -> None:
    import importlib

    try:
        importlib.import_module(module)
    except ImportError:
        # The simulator behind this adapter is not installed.
        pass


def env_ids() -> list[str]:
    for module in _BUILTIN.values():
        _load(module)
    return sorted(_ENVS)


def get_env_class(env_id: str) -> type[EnvAdapter]:
    if env_id not in _ENVS:
        for prefix, module in _BUILTIN.items():
            if env_id.startswith(prefix):
                _load(module)
    try:
        return _ENVS[env_id]
    except KeyError as exc:
        known = ", ".join(env_ids()) or "none"
        raise KeyError(f"unknown environment '{env_id}'. Known: {known}") from exc
