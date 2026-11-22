"""Shared data types passed between environments, policies and the runner."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np


@dataclass
class Observation:
    """What a policy is given at each control step."""

    #: Camera name to HxWx3 uint8 image.
    images: dict[str, np.ndarray]
    #: Proprioceptive state, e.g. joint positions.
    state: np.ndarray
    #: Natural-language instruction, empty for single-task policies.
    task: str = ""

    def copy(self) -> Observation:
        return Observation(
            images={k: v.copy() for k, v in self.images.items()},
            state=self.state.copy(),
            task=self.task,
        )


@dataclass
class StepResult:
    reward: float
    success: bool
    terminated: bool
    #: Scalar diagnostics recorded for the replay timeline.
    signals: dict[str, float] = field(default_factory=dict)
    #: Names of contact groups touching this step, e.g. {"robot:table"}.
    contacts: set[str] = field(default_factory=set)
    #: Extra cameras for the replay video, not shown to the policy.
    views: dict[str, np.ndarray] = field(default_factory=dict)


@dataclass
class EpisodeRecord:
    seed: int
    success: bool
    steps: int
    max_reward: float
    duration_s: float
    #: Per-step scalar signals, each a list of length `steps`.
    signals: dict[str, list[float]] = field(default_factory=dict)
    #: Contact group to the first step at which it occurred.
    contacts: dict[str, int] = field(default_factory=dict)
    #: Step at which this episode first departs from the nominal run on the same seed.
    first_divergence_step: int | None = None
    #: Short machine-generated label for how the episode failed.
    failure_label: str | None = None
    #: Whether the same seed succeeds with no perturbation. None when not checked.
    nominal_success: bool | None = None
    video_path: str | None = None
    error: str | None = None

    def to_json(self) -> dict[str, Any]:
        return {
            "seed": self.seed,
            "success": self.success,
            "steps": self.steps,
            "max_reward": self.max_reward,
            "duration_s": round(self.duration_s, 3),
            "signals": {k: [round(float(x), 5) for x in v] for k, v in self.signals.items()},
            "contacts": self.contacts,
            "first_divergence_step": self.first_divergence_step,
            "failure_label": self.failure_label,
            "nominal_success": self.nominal_success,
            "video_path": self.video_path,
            "error": self.error,
        }
