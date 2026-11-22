import math

import pytest

from shakedown.stats import (
    episodes_needed,
    fisher_exact_two_sided,
    mcnemar_exact,
    mmrv,
    pearson,
    wilson_interval,
)


def test_wilson_matches_known_values():
    # Reference values from the standard Wilson score formula.
    low, high = wilson_interval(38, 50)
    assert low == pytest.approx(0.6258, abs=1e-3)
    assert high == pytest.approx(0.8566, abs=1e-3)


def test_wilson_extremes_stay_in_range():
    assert wilson_interval(0, 20)[0] == 0.0
    assert wilson_interval(20, 20)[1] == 1.0
    assert 0 < wilson_interval(0, 20)[1] < 0.2
    assert wilson_interval(0, 0) == (0.0, 1.0)


def test_wilson_narrows_with_more_episodes():
    narrow = wilson_interval(800, 1000)
    wide = wilson_interval(8, 10)
    assert narrow[1] - narrow[0] < wide[1] - wide[0]


def test_wilson_rejects_impossible_counts():
    with pytest.raises(ValueError):
        wilson_interval(11, 10)


def test_mcnemar_counts_only_discordant_pairs():
    base = [True] * 10 + [False] * 10
    head = [True] * 4 + [False] * 6 + [False] * 10
    c = mcnemar_exact(base, head)
    assert (c.regressed, c.improved) == (6, 0)
    # Six discordant pairs all one way: 2 * 0.5^6.
    assert c.p_value == pytest.approx(2 * 0.5**6)
    assert c.delta == pytest.approx(-0.3)


def test_mcnemar_identical_outcomes_are_not_significant():
    outcomes = [True, False, True, True]
    assert mcnemar_exact(outcomes, outcomes).p_value == 1.0


def test_mcnemar_balanced_changes_are_not_significant():
    base = [True, True, False, False]
    head = [False, False, True, True]
    assert mcnemar_exact(base, head).p_value == 1.0


def test_mcnemar_requires_matching_lengths():
    with pytest.raises(ValueError):
        mcnemar_exact([True], [True, False])


def test_fisher_matches_known_value():
    # 2x2 table [[8, 2], [1, 5]]: two-sided p = 0.0350 (Fisher's tea-tasting style check).
    assert fisher_exact_two_sided(8, 10, 1, 6) == pytest.approx(0.0350, abs=5e-4)


def test_fisher_equal_rates():
    assert fisher_exact_two_sided(5, 10, 5, 10) == pytest.approx(1.0)


def test_episodes_needed():
    assert episodes_needed(0.5, 0.05) == 385
    assert episodes_needed(0.9, 0.02) == 865
    with pytest.raises(ValueError):
        episodes_needed(0.5, 0)


def test_pearson():
    assert pearson([0.1, 0.5, 0.9], [0.2, 0.6, 1.0]) == pytest.approx(1.0)
    assert pearson([0.1, 0.5, 0.9], [0.9, 0.5, 0.1]) == pytest.approx(-1.0)
    assert math.isnan(pearson([0.5, 0.5], [0.1, 0.9]))


def test_mmrv_zero_when_ranking_agrees():
    assert mmrv([0.2, 0.5, 0.9], [0.1, 0.4, 0.8]) == 0.0


def test_mmrv_reports_size_of_misordering():
    # Simulation ranks the first above the second; reality disagrees by 0.4.
    assert mmrv([0.8, 0.6], [0.3, 0.7]) == pytest.approx(0.4)
