import numpy as np

from shakedown.divergence import first_divergence
from shakedown.scenario import Assertions
from shakedown.verdict import Baseline, check_success_rate, evaluate, worst


def outcomes(successes, n, start=1000):
    return {start + i: i < successes for i in range(n)}


def run(assertions, mine, baseline=None, fingerprint="f", contacts=None):
    return evaluate(
        assertions=Assertions.model_validate(assertions),
        outcomes=mine,
        success_steps=[200] * sum(mine.values()),
        contact_episodes=contacts or {},
        fingerprint=fingerprint,
        baseline=baseline,
    )


def test_success_rate_pass_warn_fail():
    assert check_success_rate(45, 50, 0.8).verdict == "PASS"
    # 76% against 80%: below, but 50 episodes cannot rule out noise.
    assert check_success_rate(38, 50, 0.8).verdict == "WARN"
    # 30% against 70%: the whole interval is below the minimum.
    assert check_success_rate(15, 50, 0.7).verdict == "FAIL"


def test_warning_does_not_recommend_an_impractical_episode_count():
    message = check_success_rate(34, 50, 0.7).message
    assert "too close to the minimum" in message
    assert "8360" not in message


def test_clear_regression_fails():
    base = Baseline("v1", "f", outcomes(45, 50))
    checks, cmp, paired = run({}, outcomes(25, 50), base)
    (check,) = checks
    assert paired and check.name == "regression" and check.verdict == "FAIL"
    assert cmp.regressed == 20 and cmp.improved == 0


def test_small_drop_without_support_warns():
    base = Baseline("v1", "f", outcomes(40, 50))
    # Four seeds broke and none were fixed: an 8 point drop, p = 0.125.
    checks, _, _ = run({}, outcomes(36, 50), base)
    assert checks[0].verdict == "WARN"


def test_drop_within_the_allowed_margin_passes():
    base = Baseline("v1", "f", outcomes(40, 50))
    checks, _, _ = run({}, outcomes(39, 50), base)
    assert checks[0].verdict == "PASS"


def test_improvement_passes():
    base = Baseline("v1", "f", outcomes(20, 50))
    checks, cmp, _ = run({}, outcomes(45, 50), base)
    assert checks[0].verdict == "PASS" and cmp.improved == 25


def test_different_fingerprints_are_compared_unpaired():
    base = Baseline("v1", "other", outcomes(45, 50))
    checks, _, paired = run({}, outcomes(25, 50), base)
    assert not paired
    assert checks[0].verdict == "FAIL"
    assert checks[0].detail["paired"] is False


def test_regression_requested_without_a_baseline_is_skipped():
    checks, cmp, _ = run({"regression": {"max_drop": 0.1}}, outcomes(40, 50))
    assert cmp is None and checks[0].verdict == "SKIP"


def test_no_contact():
    passing, _, _ = run({"no_contact": {"between": "robot", "and": "table"}}, outcomes(5, 10))
    failing, _, _ = run(
        {"no_contact": {"between": "robot", "and": "table", "max_violation_rate": 0.1}},
        outcomes(5, 10),
        contacts={"robot:table": 3},
    )
    assert passing[0].verdict == "PASS"
    assert failing[0].verdict == "FAIL"


def test_worst_orders_verdicts():
    assert worst(["PASS", "WARN"]) == "WARN"
    assert worst(["PASS", "FAIL", "WARN"]) == "FAIL"
    assert worst([]) == "SKIP"


def test_divergence_finds_the_first_sustained_departure():
    t = np.linspace(0, 1, 100)
    nominal = np.stack([np.sin(t * 6), np.cos(t * 6)], axis=1)
    perturbed = nominal.copy()
    perturbed[40:, 0] += 1.0
    step, div = first_divergence(nominal, perturbed)
    assert step == 40
    assert div[:40].max() == 0


def test_divergence_ignores_a_brief_blip():
    nominal = np.zeros((50, 2))
    nominal[:, 0] = np.linspace(0, 1, 50)
    perturbed = nominal.copy()
    perturbed[10:13, 0] += 1.0
    assert first_divergence(nominal, perturbed)[0] is None


def test_divergence_scale_uses_the_whole_nominal_episode():
    # The nominal episode moves a lot, but only after the perturbed one has ended.
    nominal = np.zeros((100, 1))
    nominal[50:, 0] = 10.0
    perturbed = np.full((20, 1), 0.5)
    _, div = first_divergence(nominal, perturbed)
    assert div.max() < 0.15
