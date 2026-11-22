"""Measure how well simulated success rates predict real ones."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from shakedown.real.trials import Trial
from shakedown.stats import mmrv, pearson, wilson_interval

#: Below this many conditions a correlation coefficient is not meaningful.
MIN_CONDITIONS = 4
#: Below this many real trials per condition, a real success rate is too uncertain to rank on.
MIN_TRIALS = 5


@dataclass
class Pair:
    key: str
    label: str
    sim_rate: float
    sim_n: int
    real_rate: float
    real_n: int
    real_low: float
    real_high: float

    @property
    def gap(self) -> float:
        return self.real_rate - self.sim_rate

    @property
    def sim_outside_real_interval(self) -> bool:
        return not (self.real_low <= self.sim_rate <= self.real_high)


@dataclass
class Correlation:
    policy_label: str
    pairs: list[Pair]
    pearson: float | None
    mmrv: float | None

    @property
    def enough(self) -> bool:
        return len(self.pairs) >= MIN_CONDITIONS

    @property
    def thin(self) -> list[Pair]:
        """Conditions with too few real trials to trust their rate."""
        return [p for p in self.pairs if p.real_n < MIN_TRIALS]

    @property
    def summary(self) -> str:
        if not self.pairs:
            return "no condition was measured both in simulation and on the robot"
        if not self.enough or self.pearson is None:
            return (
                f"only {len(self.pairs)} condition(s) measured both ways; "
                f"at least {MIN_CONDITIONS} are needed to judge"
            )
        if self.thin:
            return (
                f"{len(self.thin)} condition(s) have fewer than {MIN_TRIALS} real trials; "
                "record more before judging"
            )
        if self.pearson >= 0.8 and (self.mmrv or 0.0) <= 0.1:
            return "simulation tracks reality well for this scene"
        if self.pearson >= 0.8:
            return (
                "simulation tracks reality overall but misorders some conditions; "
                "use it with care for ranking"
            )
        if self.pearson >= 0.5:
            return "simulation tracks reality loosely; use it for ranking, not for absolute rates"
        return "simulation does not predict reality for this scene"

    def to_json(self) -> dict[str, Any]:
        return {
            "policy_label": self.policy_label,
            "pearson": self.pearson,
            "mmrv": self.mmrv,
            "summary": self.summary,
            "pairs": [
                {
                    "key": p.key,
                    "label": p.label,
                    "sim_rate": p.sim_rate,
                    "sim_n": p.sim_n,
                    "real_rate": p.real_rate,
                    "real_n": p.real_n,
                    "real_low": p.real_low,
                    "real_high": p.real_high,
                    "sim_outside_real_interval": p.sim_outside_real_interval,
                }
                for p in self.pairs
            ],
        }


def correlate(result: dict[str, Any], trials: list[Trial], robot: str | None = None) -> Correlation:
    """Pair each simulated condition with real trials of the same policy and suite."""
    label = result["policy"]["label"]
    suite = result["suite"]
    counts: dict[str, list[int]] = {}
    for t in trials:
        if t.policy_label != label or t.suite != suite:
            continue
        if robot is not None and t.robot != robot:
            continue
        entry = counts.setdefault(t.condition_key, [0, 0])
        entry[0] += 1
        entry[1] += 1 if t.success else 0

    pairs = []
    for c in result["conditions"]:
        if c["key"] not in counts:
            continue
        n, s = counts[c["key"]]
        low, high = wilson_interval(s, n)
        pairs.append(
            Pair(
                key=c["key"],
                label=c["label"],
                sim_rate=c["success_rate"],
                sim_n=c["episodes"],
                real_rate=s / n,
                real_n=n,
                real_low=low,
                real_high=high,
            )
        )
    sim = [p.sim_rate for p in pairs]
    real = [p.real_rate for p in pairs]
    r = pearson(sim, real)
    violation = mmrv(sim, real) if pairs else None
    return Correlation(
        policy_label=label,
        pairs=pairs,
        pearson=None if r != r else r,  # nan when either side has no variance
        mmrv=violation,
    )
