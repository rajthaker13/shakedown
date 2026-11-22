"""Locate where a perturbed episode departs from the nominal one.

The same policy is run on the same seed with and without the perturbations.
The first divergent step is the first point at which the commanded actions
differ by more than a threshold for several consecutive steps. It is a
heuristic for where to start looking, not a causal claim.
"""

from __future__ import annotations

import numpy as np

#: Fraction of each action dimension's nominal range that counts as divergence.
THRESHOLD = 0.15
#: Consecutive steps the difference must persist.
SUSTAIN = 5
#: Floor on the per-dimension range, so dimensions that barely move do not dominate.
MIN_RANGE = 0.05


def action_divergence(nominal: np.ndarray, perturbed: np.ndarray) -> np.ndarray:
    """Per-step divergence, in units of the nominal action range.

    Both arrays are (steps, action_dim). The result covers the steps the two
    episodes have in common.
    """
    n = min(len(nominal), len(perturbed))
    if n == 0:
        return np.zeros(0)
    full = np.asarray(nominal, float)
    nominal, perturbed = full[:n], np.asarray(perturbed[:n], float)
    scale = np.maximum(full.max(axis=0) - full.min(axis=0), MIN_RANGE)
    return np.max(np.abs(perturbed - nominal) / scale, axis=1)


def first_divergence(
    nominal: np.ndarray,
    perturbed: np.ndarray,
    threshold: float = THRESHOLD,
    sustain: int = SUSTAIN,
) -> tuple[int | None, np.ndarray]:
    """Return the first sustained divergent step, and the per-step divergence."""
    div = action_divergence(nominal, perturbed)
    above = div > threshold
    run = 0
    for i, flag in enumerate(above):
        run = run + 1 if flag else 0
        if run >= sustain:
            return i - sustain + 1, div
    # The perturbed episode may simply run longer than the nominal one did.
    if len(perturbed) > len(nominal) and len(nominal) > 0:
        return len(nominal), div
    return None, div
