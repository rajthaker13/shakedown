import textwrap

import numpy as np
import pytest

from shakedown.policies.base import Policy
from shakedown.real.experiment import analyze, load_plan, remaining
from shakedown.real.robot import MockLink, run_trial
from shakedown.real.trials import Trial


class ReachPolicy(Policy):
    """Commands the goal position; optionally told the delay it runs under."""

    def __init__(self, goal=1.0):
        self.goal = goal
        self.delay = None
        self.calls = 0

    def configure(self, *, action_delay_steps: int = 0) -> None:
        self.delay = action_delay_steps

    def reset(self, seed: int) -> None:
        self.calls = 0

    def act(self, obs):
        self.calls += 1
        return np.full(len(obs.state), self.goal * min(1.0, self.calls / 10), dtype=np.float32)


class FakeClock:
    """Time that only moves when the loop sleeps, so tests run instantly."""

    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now

    def sleep(self, seconds):
        self.now += seconds


def trial(link, policy, **kwargs):
    clock = FakeClock()
    return run_trial(link, policy, seed=1, clock=clock, sleep=clock.sleep, **kwargs)


def test_the_loop_runs_at_the_control_rate_and_reaches_the_goal():
    link, policy = MockLink(fps=30), ReachPolicy()
    link.connect()
    result = trial(link, policy, max_seconds=2.0)
    assert result.steps == 60 and len(link.sent) == 60
    assert result.duration_s == pytest.approx(2.0, abs=0.05)
    assert result.overruns == 0
    assert link.succeeded()
    assert result.mean_brightness > 0


def test_added_delay_holds_actions_back_and_is_reported():
    link, policy = MockLink(fps=30), ReachPolicy()
    link.connect()
    result = trial(link, policy, max_seconds=1.0, delay_steps=6)
    assert result.added_delay_ms == pytest.approx(200.0)
    assert policy.delay == 6
    # The first six commands sent are the first one the policy chose, held.
    assert all(np.allclose(a, link.sent[0]) for a in link.sent[:7])
    assert not np.allclose(link.sent[10], link.sent[0])


def test_the_loop_can_be_stopped_by_the_operator():
    link, policy = MockLink(), ReachPolicy()
    link.connect()
    calls = {"n": 0}

    def stop():
        calls["n"] += 1
        return calls["n"] > 5

    result = trial(link, policy, max_seconds=5.0, should_stop=stop)
    assert result.stopped_early and result.steps == 5 and len(link.sent) == 5


def test_a_slow_policy_is_counted_as_an_overrun():
    class Slow(ReachPolicy):
        def __init__(self, clock):
            super().__init__()
            self.clock = clock

        def act(self, obs):
            self.clock.now += 0.1
            return super().act(obs)

    clock = FakeClock()
    link = MockLink(fps=30)
    link.connect()
    result = run_trial(link, Slow(clock), seed=1, max_seconds=1.0, clock=clock, sleep=clock.sleep)
    assert result.overruns == result.steps
    assert result.inference_ms == pytest.approx(100.0, abs=1.0)


PLAN = """
    name: delay-on-so101
    task: put the cube in the bin
    trials_per_arm: 4
    max_seconds: 20
    seed: 3
    arms:
      - { label: n50, policy: "lerobot:me/act_so101?n_action_steps=50" }
      - { label: n50-delay, policy: "lerobot:me/act_so101?n_action_steps=50", delay_ms: 200 }
      - { label: n50-delay-comp, policy: "lerobot:me/act_so101?n_action_steps=50&latency_compensation=auto", delay_ms: 200 }
"""


def plan(tmp_path):
    path = tmp_path / "plan.yaml"
    path.write_text(textwrap.dedent(PLAN))
    return load_plan(path)


def test_the_schedule_interleaves_arms_in_rounds(tmp_path):
    p = plan(tmp_path)
    schedule = p.schedule()
    assert len(schedule) == 12
    for start in range(0, 12, 3):
        round_ = schedule[start : start + 3]
        assert {arm.label for _, arm in round_} == {"n50", "n50-delay", "n50-delay-comp"}
        assert {n for n, _ in round_} == {start // 3}
    orders = [tuple(arm.label for _, arm in schedule[s : s + 3]) for s in range(0, 12, 3)]
    assert len(set(orders)) > 1, "the order within rounds should vary"
    assert [a.label for _, a in p.schedule()] == [a.label for _, a in schedule], "and be repeatable"


def test_an_interrupted_session_resumes_where_it_stopped(tmp_path):
    p = plan(tmp_path)
    done = [Trial(p.name, arm.label, arm.label, n, True) for n, arm in p.schedule()[:5]]
    left = remaining(p, done)
    assert len(left) == 7
    assert left == p.schedule()[5:]


def test_duplicate_labels_are_rejected(tmp_path):
    path = tmp_path / "plan.yaml"
    path.write_text(
        "name: x\narms:\n  - {label: a, policy: random}\n  - {label: a, policy: random}\n"
    )
    with pytest.raises(ValueError, match="own label"):
        load_plan(path)


def test_analysis_compares_every_pair_and_corrects_for_it():
    def trials(label, wins, n=20):
        return [Trial("e", label, label, i, i < wins) for i in range(n)]

    out = analyze("e", trials("plain", 16) + trials("delay", 4) + trials("comp", 15))
    assert [a["label"] for a in out["arms"]] == ["plain", "comp", "delay"]
    pairs = {(p["better"], p["worse"]): p for p in out["pairs"]}
    assert pairs[("plain", "delay")]["p_adjusted"] < 0.05
    assert pairs[("comp", "delay")]["p_adjusted"] < 0.05
    assert pairs[("plain", "comp")]["p_adjusted"] > 0.5
    assert all(p["p_adjusted"] >= p["p"] for p in out["pairs"])


def test_analysis_ignores_other_experiments():
    out = analyze("e", [Trial("other", "a", "a", 0, True)])
    assert out["arms"] == [] and out["pairs"] == []
