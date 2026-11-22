"""PushT: push a T-shaped block onto a target pose.

A 2D task simulated with pymunk rather than MuJoCo. It is included to keep
the adapter interface honest: nothing in the runner, the perturbation
library or the reports may assume a particular physics engine.

The workspace is 512 x 512 units. One unit is treated as one millimeter, so
an `object_pose` offset of 1 cm moves the block by 10 units.
"""

from __future__ import annotations

import os
from typing import ClassVar

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")

import numpy as np
import pygame
from gym_pusht.envs.pusht import PushTEnv

from shakedown.envs.base import EnvAdapter, UnsupportedPerturbation, register_env
from shakedown.perturbations import sim as P
from shakedown.perturbations.base import SimPerturbation
from shakedown.types import Observation, StepResult

_UNITS_PER_CM = 10.0


@register_env
class PushT(EnvAdapter):
    id: ClassVar[str] = "pusht"
    backend: ClassVar[str] = "pymunk"
    fps: ClassVar[int] = 10
    default_max_steps: ClassVar[int] = 300
    max_reward: ClassVar[float] = 1.0
    supported: ClassVar[frozenset[str]] = frozenset(
        {"object_pose", "object_physics", "object_appearance"}
    )
    task_description: ClassVar[str] = "Push the T-shaped block onto the T-shaped target."

    def __init__(self, perturbations: list[SimPerturbation] | None = None):
        super().__init__(perturbations)
        for p in self.perturbations:
            if isinstance(p, P.ObjectAppearance) and p.size_scale != 1.0:
                raise UnsupportedPerturbation(
                    "environment 'pusht' supports object_appearance.color but not size_scale"
                )
        self._env = PushTEnv(
            obs_type="pixels_agent_pos",
            render_mode="rgb_array",
            observation_width=96,
            observation_height=96,
            visualization_width=384,
            visualization_height=384,
        )
        self._coverage = 0.0

    def _apply_after_reset(self, seed: int) -> None:
        env = self._env
        rng = np.random.default_rng([seed, 7919])
        for p in self.perturbations:
            if isinstance(p, P.ObjectPose):
                dx, dy = (np.asarray(p.offset_cm, dtype=float) * _UNITS_PER_CM).tolist()
                if p.jitter_cm:
                    j = rng.uniform(-p.jitter_cm, p.jitter_cm, size=2) * _UNITS_PER_CM
                    dx, dy = dx + float(j[0]), dy + float(j[1])
                yaw = np.deg2rad(p.yaw_deg)
                if p.yaw_jitter_deg:
                    yaw += np.deg2rad(rng.uniform(-p.yaw_jitter_deg, p.yaw_jitter_deg))
                x, y = env.block.position
                env.block.position = (
                    float(np.clip(x + dx, 40, 472)),
                    float(np.clip(y + dy, 40, 472)),
                )
                env.block.angle = env.block.angle + float(yaw)
                env.space.step(env.dt)
            elif isinstance(p, P.ObjectPhysics):
                env.block.mass = env.block.mass * p.mass_scale
                env.block.moment = env.block.moment * p.mass_scale
                for shape in env.block.shapes:
                    shape.friction = shape.friction * p.friction_scale
            elif isinstance(p, P.ObjectAppearance):
                if p.color is not None:
                    rgb = [int(round(255 * float(c))) for c in p.color]
                    for shape in env.block.shapes:
                        shape.color = pygame.Color(*rgb, 255)

    def reset(self, seed: int) -> Observation:
        self._env.reset(seed=seed)
        self._apply_after_reset(seed)
        self._coverage = float(self._env._get_coverage())
        return self._observation(self._env.get_obs())

    def step(self, action: np.ndarray) -> tuple[Observation, StepResult]:
        action = np.clip(np.asarray(action, dtype=np.float64), 0, 512)
        raw, reward, terminated, _truncated, info = self._env.step(action)
        self._coverage = float(info["coverage"])
        agent = np.asarray(info["pos_agent"], dtype=float)
        block = np.asarray(info["block_pose"], dtype=float)
        goal = np.asarray(info["goal_pose"], dtype=float)
        result = StepResult(
            reward=float(reward),
            success=bool(info["is_success"]),
            terminated=bool(terminated),
            signals={
                "reward": float(reward),
                "coverage": self._coverage,
                "block_to_goal_mm": float(np.linalg.norm(block[:2] - goal[:2])),
                "agent_to_block_mm": float(np.linalg.norm(agent - block[:2])),
            },
            contacts=set(),
            views={"external": self._env.render()},
        )
        return self._observation(raw), result

    def initial_views(self) -> dict[str, np.ndarray]:
        return {"external": self._env.render()}

    def _observation(self, raw) -> Observation:
        return Observation(
            images={"image": np.asarray(raw["pixels"], dtype=np.uint8).copy()},
            state=np.asarray(raw["agent_pos"], dtype=np.float32).copy(),
            task=self.task_description,
        )

    def action_dim(self) -> int:
        return 2

    def failure_label(self, max_reward: float, signals: dict[str, list[float]]) -> str:
        best = max(signals.get("coverage", [0.0]) or [0.0])
        return f"best target coverage {best:.0%}, needs over 95%"

    def close(self) -> None:
        self._env.close()
