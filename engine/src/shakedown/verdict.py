"""Turn episode outcomes into verdicts.

A condition FAILs only when the evidence is statistically clear. When the
numbers look bad but the episode count cannot distinguish that from noise,
the verdict is WARN and says how many episodes would settle it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from shakedown.scenario import Assertions, RegressionAssertion
from shakedown.stats import (
    PairedComparison,
    episodes_needed,
    fisher_exact_two_sided,
    mcnemar_exact,
    wilson_interval,
)

Verdict = Literal["PASS", "WARN", "FAIL", "SKIP", "ERROR"]
_ORDER = {"SKIP": 0, "PASS": 1, "WARN": 2, "FAIL": 3, "ERROR": 4}

DEFAULT_REGRESSION = RegressionAssertion()
#: Beyond this, advising "run more episodes" stops being useful.
MAX_PRACTICAL_EPISODES = 1000


def worst(verdicts: list[Verdict]) -> Verdict:
    return max(verdicts, key=lambda v: _ORDER[v]) if verdicts else "SKIP"


@dataclass
class Check:
    name: str
    verdict: Verdict
    message: str
    detail: dict[str, Any] = field(default_factory=dict)

    def to_json(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "verdict": self.verdict,
            "message": self.message,
            "detail": self.detail,
        }


@dataclass
class Baseline:
    """Outcomes of a previous run on the same condition."""

    label: str
    fingerprint: str
    #: Seed to success.
    outcomes: dict[int, bool]


def check_success_rate(successes: int, n: int, minimum: float, confidence: float = 0.95) -> Check:
    rate = successes / n if n else 0.0
    low, high = wilson_interval(successes, n, confidence)
    detail = {"rate": rate, "min": minimum, "ci_low": low, "ci_high": high, "n": n}
    if rate >= minimum:
        return Check("success_rate", "PASS", f"{rate:.0%} meets the {minimum:.0%} minimum", detail)
    if high >= minimum:
        need = episodes_needed(rate, max(0.01, (minimum - rate) / 2), confidence)
        if need > MAX_PRACTICAL_EPISODES:
            advice = (
                "The rate is too close to the minimum to separate with a practical number "
                "of episodes"
            )
        else:
            advice = f"About {need} episodes would settle it"
        return Check(
            "success_rate",
            "WARN",
            f"{rate:.0%} is below the {minimum:.0%} minimum, but {n} episodes cannot rule out "
            f"noise (interval {low:.0%} to {high:.0%}). {advice}",
            {**detail, "episodes_needed": need},
        )
    return Check(
        "success_rate",
        "FAIL",
        f"{rate:.0%} is below the {minimum:.0%} minimum (interval {low:.0%} to {high:.0%})",
        detail,
    )


def compare(
    outcomes: dict[int, bool], baseline: Baseline, fingerprint: str
) -> tuple[PairedComparison, bool]:
    """Compare against a baseline. Returns the comparison and whether it was paired."""
    shared = sorted(set(outcomes) & set(baseline.outcomes))
    paired = fingerprint == baseline.fingerprint and len(shared) == len(outcomes) == len(
        baseline.outcomes
    )
    if paired:
        return (
            mcnemar_exact([baseline.outcomes[s] for s in shared], [outcomes[s] for s in shared]),
            True,
        )
    b_s, b_n = sum(baseline.outcomes.values()), len(baseline.outcomes)
    c_s, c_n = sum(outcomes.values()), len(outcomes)
    p = fisher_exact_two_sided(b_s, b_n, c_s, c_n)
    # Without shared seeds there are no discordant pairs to report.
    unpaired = PairedComparison(
        n=c_n,
        baseline_successes=round(b_s * c_n / b_n) if b_n else 0,
        candidate_successes=c_s,
        regressed=0,
        improved=0,
        p_value=p,
    )
    return unpaired, False


def check_regression(
    comparison: PairedComparison,
    paired: bool,
    baseline_label: str,
    baseline_rate: float,
    rule: RegressionAssertion,
) -> Check:
    candidate_rate = comparison.candidate_rate
    drop = baseline_rate - candidate_rate
    alpha = 1 - rule.confidence
    detail = {
        "baseline": baseline_label,
        "baseline_rate": baseline_rate,
        "candidate_rate": candidate_rate,
        "delta": -drop,
        "p_value": comparison.p_value,
        "paired": paired,
        "regressed_seeds": comparison.regressed,
        "improved_seeds": comparison.improved,
        "max_drop": rule.max_drop,
    }
    how = "paired on the same seeds" if paired else "unpaired"
    if drop <= rule.max_drop:
        if drop < 0:
            msg = (
                f"up {-drop:.0%} on {baseline_label} ({baseline_rate:.0%} to {candidate_rate:.0%})"
            )
        else:
            msg = f"within {rule.max_drop:.0%} of {baseline_label} ({baseline_rate:.0%} to {candidate_rate:.0%})"
        return Check("regression", "PASS", msg, detail)
    if comparison.p_value < alpha:
        return Check(
            "regression",
            "FAIL",
            f"down {drop:.0%} on {baseline_label} ({baseline_rate:.0%} to {candidate_rate:.0%}), "
            f"p = {comparison.p_value:.3g}, {how}",
            detail,
        )
    return Check(
        "regression",
        "WARN",
        f"down {drop:.0%} on {baseline_label} ({baseline_rate:.0%} to {candidate_rate:.0%}), "
        f"but not statistically clear (p = {comparison.p_value:.2g}, {how})",
        detail,
    )


def check_no_contact(
    group: str, episodes_with_contact: int, n: int, max_violation_rate: float
) -> Check:
    rate = episodes_with_contact / n if n else 0.0
    detail = {"group": group, "episodes": episodes_with_contact, "n": n, "rate": rate}
    if rate <= max_violation_rate:
        return Check(
            "no_contact",
            "PASS",
            f"{group} contact in {episodes_with_contact} of {n} episodes",
            detail,
        )
    return Check(
        "no_contact",
        "FAIL",
        f"{group} contact in {episodes_with_contact} of {n} episodes "
        f"({rate:.0%}, allowed {max_violation_rate:.0%})",
        detail,
    )


def check_max_steps(success_steps: list[int], limit: float) -> Check:
    if not success_steps:
        return Check("max_steps", "SKIP", "no successful episodes to time", {"limit": limit})
    mean = sum(success_steps) / len(success_steps)
    detail = {"mean_steps": mean, "limit": limit, "n": len(success_steps)}
    if mean <= limit:
        return Check("max_steps", "PASS", f"mean {mean:.0f} steps, limit {limit:.0f}", detail)
    return Check("max_steps", "FAIL", f"mean {mean:.0f} steps exceeds limit {limit:.0f}", detail)


def evaluate(
    *,
    assertions: Assertions,
    outcomes: dict[int, bool],
    success_steps: list[int],
    contact_episodes: dict[str, int],
    fingerprint: str,
    baseline: Baseline | None,
) -> tuple[list[Check], PairedComparison | None, bool]:
    n = len(outcomes)
    successes = sum(outcomes.values())
    checks: list[Check] = []

    if assertions.success_rate is not None:
        checks.append(check_success_rate(successes, n, assertions.success_rate.min))

    comparison: PairedComparison | None = None
    paired = False
    rule = assertions.regression or DEFAULT_REGRESSION
    if baseline is not None and baseline.outcomes:
        comparison, paired = compare(outcomes, baseline, fingerprint)
        b_rate = sum(baseline.outcomes.values()) / len(baseline.outcomes)
        checks.append(check_regression(comparison, paired, baseline.label, b_rate, rule))
    elif assertions.regression is not None:
        checks.append(Check("regression", "SKIP", "no baseline run to compare against", {}))

    if assertions.no_contact is not None:
        rule_c = assertions.no_contact
        group = f"{rule_c.between}:{rule_c.and_}"
        checks.append(
            check_no_contact(group, contact_episodes.get(group, 0), n, rule_c.max_violation_rate)
        )

    if assertions.max_steps is not None:
        checks.append(check_max_steps(success_steps, assertions.max_steps.mean))

    return checks, comparison, paired
