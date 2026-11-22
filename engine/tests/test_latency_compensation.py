"""Skipping stale actions (latency_compensation), the setting behind the README's delay result.

Loading a real checkpoint needs LeRobot and torch, so these tests wrap a fake
chunking policy and a minimal stand-in for torch in LeRobotPolicy. What they
check is the bookkeeping: with a delay of d steps and latency_compensation=auto,
the action that reaches the robot at step t + d is action d of the chunk planned
at step t.
"""

from collections import deque
from contextlib import nullcontext
from types import SimpleNamespace

import numpy as np
import pytest

from shakedown.perturbations import build
from shakedown.policies.base import PolicyError
from shakedown.policies.lerobot import LeRobotPolicy
from shakedown.types import Observation

CHUNK = 10


class FakeTensor:
    """The two tensor methods LeRobotPolicy.act calls on an action."""

    def __init__(self, value: float):
        self.value = np.array([[value]], dtype=np.float32)

    def to(self, *_):
        return self

    def numpy(self) -> np.ndarray:
        return self.value


class ChunkingPolicy:
    """Plans CHUNK actions at a time and queues them, as ACT does.

    Action k of plan p has the value p * 100 + k, so every executed action says
    which plan it came from and where in that plan it was.
    """

    def __init__(self):
        self._action_queue: deque[FakeTensor] = deque()
        self.planned_at: list[int] = []
        self.step = 0

    def select_action(self, batch):
        if not self._action_queue:
            plan = len(self.planned_at)
            self.planned_at.append(self.step)
            self._action_queue.extend(FakeTensor(plan * 100 + k) for k in range(CHUNK))
        return self._action_queue.popleft()


def make_policy(compensation) -> LeRobotPolicy:
    policy = LeRobotPolicy.__new__(LeRobotPolicy)  # skip loading a checkpoint
    policy._torch = SimpleNamespace(float32="float32", inference_mode=nullcontext)
    policy.policy = ChunkingPolicy()
    policy.config = SimpleNamespace(n_action_steps=CHUNK)
    policy._pre = policy._post = lambda x: x
    policy._image_keys, policy._state_key = [], None
    policy.dtype = "float32"
    # As LeRobotPolicy.__init__ sets them from the policy spec.
    policy.latency_compensation = compensation
    policy._skip = 0 if compensation == "auto" else int(compensation)
    return policy


def run(policy: LeRobotPolicy, delay: int, steps: int = 40) -> list[int]:
    """The value of the action that reaches the robot at each step."""
    latency = build({"action_latency": {"steps": delay}})
    rng = np.random.default_rng(0)
    latency.begin_episode(rng)
    policy.configure(action_delay_steps=delay)
    obs = Observation(images={}, state=np.zeros(1, dtype=np.float32))
    executed = []
    for t in range(steps):
        policy.policy.step = t
        action = policy.act(obs)
        executed.append(int(latency.transform_action(action, rng, t)[0]))
    return executed


def complete_plans(policy: LeRobotPolicy, steps: int = 40):
    """(plan number, step it was made at) for plans whose actions all arrived in time."""
    return [(p, t) for p, t in enumerate(policy.policy.planned_at) if t + CHUNK <= steps]


@pytest.mark.parametrize("delay", [1, 3, 5])
def test_with_skipping_each_action_arrives_at_its_own_step(delay):
    policy = make_policy("auto")
    executed = run(policy, delay)
    # Each plan executes CHUNK - delay actions, so a new plan is made that often.
    assert policy.policy.planned_at[:3] == [0, CHUNK - delay, 2 * (CHUNK - delay)]
    for plan, t in complete_plans(policy):
        # Action k of a plan made at step t reaches the robot at step t + k.
        assert executed[t + delay] == plan * 100 + delay
        for k in range(delay, CHUNK):
            assert executed[t + k] == plan * 100 + k


def test_without_skipping_each_action_arrives_late():
    delay = 3
    policy = make_policy(0)
    executed = run(policy, delay)
    for plan, t in complete_plans(policy):
        # The robot runs action k at step t + k + delay: always `delay` steps stale.
        for k in range(CHUNK - delay):
            assert executed[t + k + delay] == plan * 100 + k


def test_auto_changes_nothing_without_delay():
    assert run(make_policy("auto"), delay=0) == run(make_policy(0), delay=0)


def test_skipping_a_whole_chunk_is_refused():
    with pytest.raises(PolicyError, match="cannot skip"):
        make_policy("auto").configure(action_delay_steps=CHUNK)
