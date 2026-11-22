"""Statistics for binary episode outcomes.

Success rates from a few dozen episodes are noisy. Every verdict here is
backed by an interval or a test so that a run never reports a regression
that is indistinguishable from sampling noise.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# Two-sided z values for the confidence levels scenarios may ask for.
_Z = {0.80: 1.2815515655, 0.90: 1.6448536270, 0.95: 1.9599639845, 0.99: 2.5758293035}


def z_value(confidence: float) -> float:
    try:
        return _Z[round(confidence, 2)]
    except KeyError as exc:
        raise ValueError(f"confidence must be one of {sorted(_Z)}, got {confidence}") from exc


def wilson_interval(successes: int, n: int, confidence: float = 0.95) -> tuple[float, float]:
    """Wilson score interval for a binomial proportion.

    Preferred over the normal approximation because it stays inside [0, 1]
    and behaves at the extremes (0/n and n/n), which is where policy
    evaluations usually sit.
    """
    if n <= 0:
        return (0.0, 1.0)
    if not 0 <= successes <= n:
        raise ValueError(f"successes must be in [0, {n}], got {successes}")
    z = z_value(confidence)
    p = successes / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    low = 0.0 if successes == 0 else max(0.0, center - half)
    high = 1.0 if successes == n else min(1.0, center + half)
    return (low, high)


def _binom_two_sided(k: int, n: int) -> float:
    """Exact two-sided binomial test of k successes in n trials against p = 0.5."""
    if n == 0:
        return 1.0
    tail = sum(math.comb(n, i) for i in range(min(k, n - k) + 1))
    return min(1.0, 2.0 * tail / (2**n))


@dataclass(frozen=True)
class PairedComparison:
    """Result of comparing a candidate against a baseline on the same seeds."""

    n: int
    baseline_successes: int
    candidate_successes: int
    #: Seeds the baseline solved and the candidate did not.
    regressed: int
    #: Seeds the candidate solved and the baseline did not.
    improved: int
    p_value: float

    @property
    def baseline_rate(self) -> float:
        return self.baseline_successes / self.n if self.n else 0.0

    @property
    def candidate_rate(self) -> float:
        return self.candidate_successes / self.n if self.n else 0.0

    @property
    def delta(self) -> float:
        return self.candidate_rate - self.baseline_rate


def mcnemar_exact(baseline: list[bool], candidate: list[bool]) -> PairedComparison:
    """Exact McNemar test on paired outcomes.

    Both lists must be ordered by the same seeds. Only the discordant pairs
    carry information, which makes this far more sensitive than comparing two
    independent success rates when the seeds are shared.
    """
    if len(baseline) != len(candidate):
        raise ValueError("paired comparison needs outcomes for the same seeds")
    regressed = sum(1 for b, c in zip(baseline, candidate) if b and not c)
    improved = sum(1 for b, c in zip(baseline, candidate) if c and not b)
    p = _binom_two_sided(min(regressed, improved), regressed + improved)
    return PairedComparison(
        n=len(baseline),
        baseline_successes=sum(baseline),
        candidate_successes=sum(candidate),
        regressed=regressed,
        improved=improved,
        p_value=p,
    )


def fisher_exact_two_sided(s1: int, n1: int, s2: int, n2: int) -> float:
    """Two-sided Fisher exact test for two independent success counts.

    Used when the baseline and the candidate were not run on the same seeds.
    """
    if n1 == 0 or n2 == 0:
        return 1.0
    total_s = s1 + s2
    total_n = n1 + n2

    def prob(a: int) -> float:
        return math.comb(n1, a) * math.comb(n2, total_s - a) / math.comb(total_n, total_s)

    observed = prob(s1)
    lo = max(0, total_s - n2)
    hi = min(n1, total_s)
    p = sum(prob(a) for a in range(lo, hi + 1) if prob(a) <= observed * (1 + 1e-9))
    return min(1.0, p)


def episodes_needed(p: float, margin: float, confidence: float = 0.95) -> int:
    """Episodes needed for a confidence interval of half-width `margin` around `p`."""
    if not 0 < margin < 1:
        raise ValueError("margin must be between 0 and 1")
    z = z_value(confidence)
    p = min(max(p, 0.0), 1.0)
    return max(1, math.ceil(z * z * p * (1 - p) / (margin * margin)))


def pearson(xs: list[float], ys: list[float]) -> float:
    """Pearson correlation. Returns nan when either side has no variance."""
    n = len(xs)
    if n != len(ys) or n < 2:
        return float("nan")
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    if sxx == 0 or syy == 0:
        return float("nan")
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    return sxy / math.sqrt(sxx * syy)


def mmrv(sim: list[float], real: list[float]) -> float:
    """Mean maximum rank violation between simulated and real success rates.

    Introduced by the SIMPLER evaluation work. For each pair of conditions the
    simulator ranks in the opposite order to reality, the violation is the
    size of the real-world gap. Each condition contributes its worst
    violation; the metric is the mean of those. Zero means the simulator
    never misorders two conditions.
    """
    n = len(sim)
    if n != len(real):
        raise ValueError("sim and real must have the same length")
    if n == 0:
        return float("nan")
    worst = []
    for i in range(n):
        violation = 0.0
        for j in range(n):
            if i == j:
                continue
            if (sim[i] < sim[j]) != (real[i] < real[j]):
                violation = max(violation, abs(real[i] - real[j]))
        worst.append(violation)
    return sum(worst) / n
