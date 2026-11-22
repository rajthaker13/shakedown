"""Run a policy on a real arm, under chosen runtime settings and added delay.

The control loop is the same one the simulator uses: observe, ask the policy,
delay the action if the experiment says so, send it. What differs is that the
world is real, time is real, and a person says whether the attempt succeeded.

Nothing here has been run on hardware yet. It is tested against `MockLink`,
a stand-in arm. Expect to adjust it the first time it meets a real robot.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Protocol

import numpy as np

from shakedown.perturbations.io import ActionLatency
from shakedown.policies.base import Policy
from shakedown.types import Observation


class RobotError(RuntimeError):
    pass


class RobotLink(Protocol):
    """The few things the loop needs from a robot."""

    fps: int

    def connect(self) -> None: ...
    def observe(self) -> Observation: ...
    def send(self, action: np.ndarray) -> None: ...
    def disconnect(self) -> None: ...


class LeRobotLink:
    """A real arm, driven through LeRobot's robot classes (SO-100, SO-101, Koch and others)."""

    def __init__(
        self,
        robot_type: str,
        port: str,
        cameras: dict[str, int | str],
        *,
        fps: int = 30,
        width: int = 640,
        height: int = 480,
        robot_id: str = "shakedown",
        max_relative_target: float | None = 10.0,
        task: str = "",
    ):
        self.robot_type = robot_type
        self.port = port
        self.cameras = cameras
        self.fps = fps
        self.size = (width, height)
        self.robot_id = robot_id
        # Limits how far any joint may be asked to move in one step. A policy
        # that misbehaves should not be able to throw the arm.
        self.max_relative_target = max_relative_target
        self.task = task
        self._robot: Any = None
        self._motors: list[str] = []

    def connect(self) -> None:
        try:
            from lerobot.cameras.opencv.configuration_opencv import OpenCVCameraConfig
            from lerobot.robots import make_robot_from_config
            from lerobot.robots.config import RobotConfig
        except ImportError as exc:
            raise RobotError(
                "LeRobot is not installed. From the repository, run: pip install -e 'engine[lerobot]'"
            ) from exc
        try:
            config_cls = RobotConfig.get_choice_class(self.robot_type)
        except Exception as exc:  # noqa: BLE001
            raise RobotError(f"LeRobot has no robot type '{self.robot_type}'") from exc
        width, height = self.size
        cameras = {
            name: OpenCVCameraConfig(index_or_path=source, fps=self.fps, width=width, height=height)
            for name, source in self.cameras.items()
        }
        config = config_cls(
            port=self.port,
            id=self.robot_id,
            cameras=cameras,
            max_relative_target=self.max_relative_target,
        )
        self._robot = make_robot_from_config(config)
        try:
            self._robot.connect()
        except Exception as exc:  # noqa: BLE001
            raise RobotError(f"could not connect to the robot on {self.port}: {exc}") from exc
        self._motors = [
            key.removesuffix(".pos") for key in self._robot.action_features if key.endswith(".pos")
        ]
        if not self._motors:
            raise RobotError("the robot reports no position-controlled motors")

    def observe(self) -> Observation:
        raw = self._robot.get_observation()
        state = np.asarray([raw[f"{m}.pos"] for m in self._motors], dtype=np.float32)
        images = {
            name: np.asarray(raw[name], dtype=np.uint8) for name in self.cameras if name in raw
        }
        missing = set(self.cameras) - set(images)
        if missing:
            raise RobotError(f"no image from camera(s): {', '.join(sorted(missing))}")
        return Observation(images=images, state=state, task=self.task)

    def send(self, action: np.ndarray) -> None:
        if len(action) != len(self._motors):
            raise RobotError(
                f"the policy produced {len(action)} values and the robot has "
                f"{len(self._motors)} motors ({', '.join(self._motors)})"
            )
        self._robot.send_action({f"{m}.pos": float(v) for m, v in zip(self._motors, action)})

    def disconnect(self) -> None:
        if self._robot is not None:
            self._robot.disconnect()
            self._robot = None


class MockLink:
    """A stand-in arm for testing the loop without hardware.

    Each joint moves a fraction of the way to its commanded position every
    step, as a position-controlled servo roughly does. The attempt counts as
    a success if the arm ends close to `goal`.
    """

    def __init__(self, fps: int = 30, joints: int = 6, goal: float = 1.0, response: float = 0.35):
        self.fps = fps
        self.joints = joints
        self.goal = goal
        self.response = response
        self.state = np.zeros(joints, dtype=np.float32)
        self.sent: list[np.ndarray] = []
        self.connected = False

    def connect(self) -> None:
        self.connected = True
        self.state = np.zeros(self.joints, dtype=np.float32)
        self.sent = []

    def observe(self) -> Observation:
        level = int(np.clip(60 + 80 * float(self.state.mean()), 0, 255))
        image = np.full((48, 64, 3), level, dtype=np.uint8)
        return Observation(images={"top": image}, state=self.state.copy())

    def send(self, action: np.ndarray) -> None:
        action = np.asarray(action, dtype=np.float32)
        self.sent.append(action.copy())
        self.state = self.state + self.response * (action - self.state)

    def succeeded(self, tolerance: float = 0.1) -> bool:
        return bool(np.all(np.abs(self.state - self.goal) < tolerance))

    def disconnect(self) -> None:
        self.connected = False


@dataclass
class TrialResult:
    steps: int
    duration_s: float
    #: Median time the policy took to choose an action.
    inference_ms: float
    #: Steps at which the loop fell behind its control rate.
    overruns: int
    #: Delay added by the experiment, in milliseconds.
    added_delay_ms: float
    mean_brightness: float
    stopped_early: bool = False
    inference_all_ms: list[float] = field(default_factory=list, repr=False)


def run_trial(
    link: RobotLink,
    policy: Policy,
    *,
    seed: int,
    max_seconds: float,
    delay_steps: int = 0,
    should_stop: Any = None,
    clock: Any = time.perf_counter,
    sleep: Any = time.sleep,
) -> TrialResult:
    """Run one attempt. The caller decides afterwards whether it succeeded.

    `delay_steps` holds each action back by that many control steps before it
    is sent, on top of whatever delay the robot already has. The policy is
    told the delay, so a policy set to compensate can do so.
    """
    period = 1.0 / link.fps
    latency = ActionLatency(steps=delay_steps)
    latency.begin_episode(np.random.default_rng(seed))
    policy.configure(action_delay_steps=delay_steps)
    policy.reset(seed)

    inference: list[float] = []
    brightness: list[float] = []
    overruns = 0
    stopped = False
    started = clock()
    steps = int(round(max_seconds * link.fps))
    step = 0
    for step in range(steps):
        tick = clock()
        if should_stop is not None and should_stop():
            stopped = True
            break
        obs = link.observe()
        if obs.images:
            brightness.append(float(next(iter(obs.images.values()))[::8, ::8].mean()))
        before = clock()
        action = np.asarray(policy.act(obs), dtype=np.float32)
        inference.append(1000.0 * (clock() - before))
        link.send(latency.transform_action(action, np.random.default_rng(0), step))
        spent = clock() - tick
        if spent > period:
            overruns += 1
        else:
            sleep(period - spent)
    return TrialResult(
        steps=step + (0 if stopped else 1),
        duration_s=clock() - started,
        inference_ms=float(np.median(inference)) if inference else 0.0,
        overruns=overruns,
        added_delay_ms=1000.0 * delay_steps / link.fps,
        mean_brightness=float(np.mean(brightness)) if brightness else 0.0,
        stopped_early=stopped,
        inference_all_ms=inference,
    )
