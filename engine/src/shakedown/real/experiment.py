"""Plan and analyze an experiment on a real robot.

An experiment compares a few arms: each is a policy with its runtime
settings and an added delay. Attempts are interleaved in a random order, and
the person judging success is not told which arm is running. Both guard
against the ways real-robot comparisons usually go wrong: conditions that
drift over a session, and a judge who knows what they hope to see.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator

from shakedown.real.trials import Trial
from shakedown.stats import fisher_exact_two_sided, wilson_interval


class Arm(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: str = Field(min_length=1, max_length=60)
    policy: str
    delay_ms: float = Field(default=0.0, ge=0, le=2000)


class Plan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=80)
    task: str = ""
    trials_per_arm: int = Field(default=20, ge=1, le=500)
    max_seconds: float = Field(default=30.0, gt=0, le=600)
    seed: int = 0
    arms: list[Arm] = Field(min_length=1, max_length=20)

    @field_validator("arms")
    @classmethod
    def _unique_labels(cls, arms: list[Arm]) -> list[Arm]:
        labels = [a.label for a in arms]
        if len(set(labels)) != len(labels):
            raise ValueError("every arm needs its own label")
        return arms

    def schedule(self) -> list[tuple[int, Arm]]:
        """Every attempt, in the order to run them: (trial number within its arm, arm).

        Attempts are shuffled within rounds, so each arm appears once before any
        appears twice. Drift over the session then affects all arms alike.
        """
        rng = random.Random(self.seed)
        order: list[tuple[int, Arm]] = []
        for trial in range(self.trials_per_arm):
            round_ = list(self.arms)
            rng.shuffle(round_)
            order.extend((trial, arm) for arm in round_)
        return order


def load_plan(path: str | Path) -> Plan:
    path = Path(path)
    try:
        return Plan.model_validate(yaml.safe_load(path.read_text()))
    except (OSError, yaml.YAMLError) as exc:
        raise ValueError(f"{path}: {exc}") from exc
    except Exception as exc:  # pydantic.ValidationError
        raise ValueError(f"{path}: {exc}") from exc


def remaining(plan: Plan, done: list[Trial]) -> list[tuple[int, Arm]]:
    """The attempts still to run, so that an interrupted session can be resumed."""
    finished = {(t.condition_key, t.trial) for t in done if t.suite == plan.name}
    return [(n, arm) for n, arm in plan.schedule() if (arm.label, n) not in finished]


@dataclass
class ArmResult:
    label: str
    trials: int
    successes: int

    @property
    def rate(self) -> float:
        return self.successes / self.trials if self.trials else 0.0

    @property
    def interval(self) -> tuple[float, float]:
        return wilson_interval(self.successes, self.trials)


def analyze(plan_name: str, trials: list[Trial]) -> dict[str, Any]:
    """Success per arm, and every pair of arms compared.

    Attempts on a real robot do not share seeds, so pairs are compared with
    Fisher's exact test, with Holm's correction for the number of pairs.
    """
    counts: dict[str, list[int]] = {}
    for t in trials:
        if t.suite != plan_name:
            continue
        entry = counts.setdefault(t.condition_key, [0, 0])
        entry[0] += 1
        entry[1] += 1 if t.success else 0
    arms = [ArmResult(label, n, s) for label, (n, s) in counts.items()]
    arms.sort(key=lambda a: -a.rate)

    pairs = []
    for i, a in enumerate(arms):
        for b in arms[i + 1 :]:
            p = fisher_exact_two_sided(a.successes, a.trials, b.successes, b.trials)
            pairs.append({"better": a.label, "worse": b.label, "gap": a.rate - b.rate, "p": p})
    ordered = sorted(pairs, key=lambda x: x["p"])
    running = 0.0
    for rank, pair in enumerate(ordered):
        running = max(running, min(1.0, pair["p"] * (len(ordered) - rank)))
        pair["p_adjusted"] = running
    return {
        "arms": [
            {
                "label": a.label,
                "trials": a.trials,
                "successes": a.successes,
                "rate": a.rate,
                "ci_low": a.interval[0],
                "ci_high": a.interval[1],
            }
            for a in arms
        ],
        "pairs": sorted(pairs, key=lambda x: -x["gap"]),
    }
