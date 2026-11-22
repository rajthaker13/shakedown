"""Choose runtime settings for a policy.

What runs on a robot is a checkpoint together with settings such as how
many actions are executed before the policy looks again. Those settings
change behavior under delay and imperfect actuation, and they are usually
left at whatever the checkpoint was published with.

Given results for several settings on the same seeds, this ranks them by
success across every condition and says whether the best one is really
better, or only appears so by chance.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from shakedown.stats import mcnemar_exact, wilson_interval

#: A difference is treated as real below this p value.
ALPHA = 0.05


@dataclass
class Candidate:
    label: str
    spec: str
    episodes: int
    successes: int
    #: Lowest success rate over the conditions, and where it occurred.
    worst_rate: float
    worst_condition: str
    #: Seed-level outcomes over every condition, keyed by (condition, seed).
    outcomes: dict[tuple[str, int], bool] = field(repr=False, default_factory=dict)
    fingerprints: dict[str, str] = field(repr=False, default_factory=dict)

    @property
    def rate(self) -> float:
        return self.successes / self.episodes if self.episodes else 0.0

    @property
    def interval(self) -> tuple[float, float]:
        return wilson_interval(self.successes, self.episodes)


@dataclass
class Recommendation:
    ranked: list[Candidate]
    chosen: Candidate
    #: Settings that cannot be told apart from the best one.
    tied: list[Candidate]
    clear: bool
    reason: str
    #: p value of each other candidate against the best, by label, after Holm's correction.
    p_values: dict[str, float]
    tolerance: list[str]

    def to_json(self) -> dict[str, Any]:
        return {
            "chosen": {"label": self.chosen.label, "spec": self.chosen.spec},
            "clear": self.clear,
            "reason": self.reason,
            "tied": [c.label for c in self.tied],
            "tolerance": self.tolerance,
            "ranked": [
                {
                    "label": c.label,
                    "spec": c.spec,
                    "success_rate": c.rate,
                    "ci_low": c.interval[0],
                    "ci_high": c.interval[1],
                    "episodes": c.episodes,
                    "worst_rate": c.worst_rate,
                    "worst_condition": c.worst_condition,
                    "p_vs_best": self.p_values.get(c.label),
                }
                for c in self.ranked
            ],
        }


def candidate(result: dict[str, Any]) -> Candidate:
    outcomes: dict[tuple[str, int], bool] = {}
    fingerprints: dict[str, str] = {}
    worst_rate, worst_condition = 1.0, ""
    for c in result["conditions"]:
        fingerprints[c["key"]] = c["fingerprint"]
        for seed, ok in c["outcomes"].items():
            outcomes[(c["key"], int(seed))] = bool(ok)
        if c["episodes"] and c["success_rate"] <= worst_rate:
            worst_rate, worst_condition = c["success_rate"], c["label"]
    return Candidate(
        label=result["policy"]["label"],
        spec=result["policy"]["spec"],
        episodes=len(outcomes),
        successes=sum(outcomes.values()),
        worst_rate=worst_rate,
        worst_condition=worst_condition,
        outcomes=outcomes,
        fingerprints=fingerprints,
    )


def _paired_p(a: Candidate, b: Candidate) -> float:
    """Exact McNemar over every episode the two settings share."""
    shared = [
        key
        for key in a.outcomes
        if key in b.outcomes and a.fingerprints.get(key[0]) == b.fingerprints.get(key[0])
    ]
    if not shared:
        return 1.0
    return mcnemar_exact([b.outcomes[k] for k in shared], [a.outcomes[k] for k in shared]).p_value


def _holm(p_values: dict[str, float]) -> dict[str, float]:
    """Holm's correction, so that trying more settings does not make a win easier to find."""
    ordered = sorted(p_values.items(), key=lambda item: item[1])
    adjusted: dict[str, float] = {}
    running = 0.0
    for rank, (label, p) in enumerate(ordered):
        running = max(running, min(1.0, p * (len(ordered) - rank)))
        adjusted[label] = running
    return adjusted


def _tolerance(result: dict[str, Any], max_drop: float = 0.10) -> list[str]:
    """For swept perturbations, how far along the sweep success holds before it clearly drops."""
    nominal = next((c for c in result["conditions"] if not c["perturbations"]), None)
    if nominal is None:
        return []
    base = {int(s): bool(ok) for s, ok in nominal["outcomes"].items()}
    out = []
    groups: dict[str, list[dict[str, Any]]] = {}
    for c in result["conditions"]:
        if c.get("sweep_name") and isinstance(c.get("sweep_value"), (int, float)):
            groups.setdefault(f"{c['scenario']}:{c['sweep_name']}", []).append(c)
    for name, conditions in groups.items():
        # Conditions are taken in the order the scenario lists them, which is the
        # author's order of severity. Sorting by value would get "dimmer" backwards.
        held = None
        broke = None
        for c in conditions:
            mine = {int(s): bool(ok) for s, ok in c["outcomes"].items()}
            seeds = sorted(set(base) & set(mine))
            if not seeds:
                continue
            cmp = mcnemar_exact([base[s] for s in seeds], [mine[s] for s in seeds])
            dropped = -cmp.delta > max_drop and cmp.p_value < ALPHA
            if dropped:
                broke = c
                break
            held = c
        scenario, parameter = name.split(":")
        if broke is None and held is not None:
            out.append(
                f"{scenario}: no clear drop up to {parameter}={held['sweep_value']}, "
                "the last value tested"
            )
        elif broke is not None:
            upto = f"holds up to {parameter}={held['sweep_value']}" if held else "does not hold"
            out.append(
                f"{scenario}: {upto}; drops to {broke['success_rate']:.0%} at "
                f"{parameter}={broke['sweep_value']} (from {nominal['success_rate']:.0%})"
            )
    return out


def recommend(results: list[dict[str, Any]], default_label: str | None = None) -> Recommendation:
    """Rank settings and choose one.

    When the best setting is not clearly better than others, the choice falls
    to the published default if it is among those tied, and otherwise to the
    tied setting with the best worst case. Picking the highest number from a
    set of indistinguishable results would be choosing noise.
    """
    if not results:
        raise ValueError("no results to choose from")
    candidates = [candidate(r) for r in results]
    ranked = sorted(candidates, key=lambda c: (-c.rate, -c.worst_rate, c.label))
    best = ranked[0]
    p_values = _holm({c.label: _paired_p(c, best) for c in ranked[1:]})
    tied = [best] + [c for c in ranked[1:] if p_values[c.label] >= ALPHA]
    clear = len(tied) == 1

    if clear:
        chosen = best
        reason = (
            f"{best.label} succeeds in {best.rate:.0%} of episodes across all conditions and is "
            f"clearly better than every other setting tested."
        )
    else:
        default = next((c for c in tied if c.label == default_label), None)
        if default is not None:
            chosen = default
            reason = (
                f"{len(tied)} settings cannot be told apart. {default.label} is the published "
                "setting and is among them, so there is no evidence for changing it."
            )
        else:
            chosen = max(tied, key=lambda c: (c.worst_rate, c.rate))
            reason = (
                f"{len(tied)} settings cannot be told apart on overall success. "
                f"{chosen.label} has the best worst case of those: {chosen.worst_rate:.0%} "
                f"under {chosen.worst_condition}."
            )
    by_label = {r["policy"]["label"]: r for r in results}
    return Recommendation(
        ranked=ranked,
        chosen=chosen,
        tied=tied,
        clear=clear,
        reason=reason,
        p_values=p_values,
        tolerance=_tolerance(by_label[chosen.label]),
    )
