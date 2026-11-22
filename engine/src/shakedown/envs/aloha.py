"""ALOHA bimanual manipulation tasks in MuJoCo.

Wraps the `gym-aloha` tasks (two ViperX arms, joint position control, a top
camera) and applies sim perturbations directly to the MuJoCo model.
"""

from __future__ import annotations

import os
import shutil
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import ClassVar

# dm_control picks its rendering backend at import time.
os.environ.setdefault("MUJOCO_GL", "glfw" if os.uname().sysname == "Darwin" else "egl")

import numpy as np
from dm_control import mujoco as dm_mujoco
from dm_control.rl import control
from gym_aloha.constants import ASSETS_DIR, DT
from gym_aloha.tasks import sim as aloha_sim
from gym_aloha.utils import sample_box_pose, sample_insertion_pose

from shakedown.envs.base import EnvAdapter, register_env
from shakedown.envs.mujoco_scene import (
    SceneMap,
    apply_model_perturbation,
    contact_groups,
    distractor_elements,
    quat_axis_angle,
    quat_mul,
    scanned_scene_elements,
)
from shakedown.perturbations import sim as P
from shakedown.perturbations.base import SimPerturbation
from shakedown.types import Observation, StepResult

_SUPPORTED = frozenset(
    {
        "lighting",
        "camera_pose",
        "object_pose",
        "object_appearance",
        "object_physics",
        "surface_appearance",
        "distractors",
        "actuator_gain",
        "joint_damping",
        "scanned_scene",
    }
)

_FINGERS = ["gripper_finger"]


class _AlohaBase(EnvAdapter):
    backend: ClassVar[str] = "mujoco"
    fps: ClassVar[int] = int(round(1 / DT))
    default_max_steps: ClassVar[int] = 400
    max_reward: ClassVar[float] = 4.0
    supported: ClassVar[frozenset[str]] = _SUPPORTED

    xml_name: ClassVar[str]
    #: Number of free-jointed task objects, in qpos order after the 16 arm joints.
    n_objects: ClassVar[int]
    scene: ClassVar[SceneMap]
    #: Camera the policy sees, and the camera used for the replay's external view.
    policy_camera: ClassVar[str] = "top"
    replay_camera: ClassVar[str] = "angle"

    def __init__(self, perturbations: list[SimPerturbation] | None = None):
        super().__init__(perturbations)
        self._tmpdir: str | None = None
        self._pose_perturbations = [p for p in self.perturbations if isinstance(p, P.ObjectPose)]
        physics = dm_mujoco.Physics.from_xml_path(str(self._build_xml()))
        for p in self.perturbations:
            if isinstance(p, (P.ObjectPose, P.Distractors)):
                continue
            if isinstance(p, P.ScannedScene):
                if p.hide_surface:
                    for name in self.scene.surface_geoms:
                        gid = physics.model.name2id(name, "geom")
                        physics.model.geom_rgba[gid, 3] = 0.0
                continue
            if not apply_model_perturbation(physics.model.ptr, physics.data.ptr, self.scene, p):
                raise NotImplementedError(f"{self.id}: '{p.name}' has no MuJoCo implementation")
        self._physics = physics
        self._task = self._make_task()
        self._env = control.Environment(
            physics,
            self._task,
            float("inf"),
            control_timestep=DT,
            n_sub_steps=None,
            flat_observation=False,
        )
        self._start_pose: np.ndarray | None = None

    # -- construction ---------------------------------------------------------------

    def _make_task(self):
        raise NotImplementedError

    def _nominal_pose(self, seed: int) -> np.ndarray:
        raise NotImplementedError

    def _build_xml(self) -> Path:
        distractors = [p for p in self.perturbations if isinstance(p, P.Distractors)]
        scans = [p for p in self.perturbations if isinstance(p, P.ScannedScene)]
        source = Path(ASSETS_DIR) / self.xml_name
        if not distractors and not scans:
            return source
        # MJCF includes and meshes are resolved relative to the main file, so the
        # edited copy has to live next to a full set of assets.
        self._tmpdir = tempfile.mkdtemp(prefix="shakedown-aloha-")
        for item in Path(ASSETS_DIR).iterdir():
            if item.is_file():
                shutil.copy2(item, Path(self._tmpdir) / item.name)
        tree = ET.parse(source)
        root = tree.getroot()
        world = root.find("worldbody")
        if world is None:
            raise RuntimeError(f"{source} has no <worldbody>")
        for i, p in enumerate(distractors):
            for el in distractor_elements(p, self.scene, prefix=f"distractor{i}"):
                world.append(el)
        if scans:
            asset = root.find("asset")
            if asset is None:
                asset = ET.SubElement(root, "asset")
            for i, p in enumerate(scans):
                meshes, body = scanned_scene_elements(p, i)
                asset.extend(meshes)
                world.append(body)
        target = Path(self._tmpdir) / self.xml_name
        tree.write(target)
        return target

    # -- episode --------------------------------------------------------------------

    def _perturbed_pose(self, seed: int) -> np.ndarray:
        pose = self._nominal_pose(seed).astype(float).copy()
        rng = np.random.default_rng([seed, 7919])
        for p in self._pose_perturbations:
            dx, dy = p.offset_cm[0] / 100.0, p.offset_cm[1] / 100.0
            if p.jitter_cm:
                j = rng.uniform(-p.jitter_cm, p.jitter_cm, size=2) / 100.0
                dx, dy = dx + j[0], dy + j[1]
            yaw = p.yaw_deg
            if p.yaw_jitter_deg:
                yaw += float(rng.uniform(-p.yaw_jitter_deg, p.yaw_jitter_deg))
            for k in range(self.n_objects):
                base = 7 * k
                pose[base + 0] += dx
                pose[base + 1] += dy
                if yaw:
                    pose[base + 3 : base + 7] = quat_mul(
                        quat_axis_angle((0, 0, 1), yaw), pose[base + 3 : base + 7]
                    )
        return pose

    def reset(self, seed: int) -> Observation:
        self._task.random.seed(seed)
        self._task._random = np.random.RandomState(seed)
        self._start_pose = self._perturbed_pose(seed)
        aloha_sim.BOX_POSE[0] = self._start_pose
        ts = self._env.reset()
        self._last_raw = ts.observation
        return self._observation(ts.observation)

    def step(self, action: np.ndarray) -> tuple[Observation, StepResult]:
        action = np.asarray(action, dtype=np.float64)
        if action.shape != (self.action_dim(),):
            raise ValueError(f"expected action of shape ({self.action_dim()},), got {action.shape}")
        ts = self._env.step(action)
        raw = ts.observation
        self._last_raw = raw
        reward = float(ts.reward or 0.0)
        success = reward >= self.max_reward
        model, data = self._physics.model.ptr, self._physics.data.ptr
        result = StepResult(
            reward=reward,
            success=success,
            terminated=success,
            signals=self._signals(reward),
            contacts=contact_groups(model, data, self.scene),
            views={"external": raw["images"][self.replay_camera].copy()},
        )
        return self._observation(raw), result

    def _observation(self, raw) -> Observation:
        return Observation(
            images={self.policy_camera: raw["images"][self.policy_camera].copy()},
            state=np.asarray(raw["qpos"], dtype=np.float32).copy(),
            task=self.task_description,
        )

    def initial_views(self) -> dict[str, np.ndarray]:
        return {"external": self._last_raw["images"][self.replay_camera].copy()}

    def _gripper_pos(self, side: str) -> np.ndarray:
        named = self._physics.named.data.xpos
        return 0.5 * (
            np.asarray(named[f"vx300s_{side}/left_finger_link"])
            + np.asarray(named[f"vx300s_{side}/right_finger_link"])
        )

    def _object_pos(self, body: str) -> np.ndarray:
        return np.asarray(self._physics.named.data.xpos[body])

    def _signals(self, reward: float) -> dict[str, float]:
        raise NotImplementedError

    def action_dim(self) -> int:
        return 14

    def close(self) -> None:
        if self._tmpdir:
            shutil.rmtree(self._tmpdir, ignore_errors=True)
            self._tmpdir = None


@register_env
class AlohaTransferCube(_AlohaBase):
    id: ClassVar[str] = "aloha/transfer_cube"
    task_description: ClassVar[str] = (
        "Pick up the cube with the right arm and transfer it to the left arm."
    )
    xml_name: ClassVar[str] = "bimanual_viperx_transfer_cube.xml"
    n_objects: ClassVar[int] = 1
    scene: ClassVar[SceneMap] = SceneMap(
        object_geoms=["red_box"],
        object_bodies=["box"],
        surface_geoms=["table"],
        robot_geom_prefixes=["vx300s_"],
        finger_geom_markers=_FINGERS,
        distractor_region=(-0.30, 0.30, 0.38, 0.82, 0.0),
        # Keep the cube's spawn area and both arm bases clear.
        keep_clear=[(0.10, 0.50, 0.17), (-0.469, 0.5, 0.12), (0.469, 0.5, 0.12)],
    )

    def _make_task(self):
        return aloha_sim.TransferCubeTask()

    def _nominal_pose(self, seed: int) -> np.ndarray:
        return sample_box_pose(seed)

    def _signals(self, reward: float) -> dict[str, float]:
        cube = self._object_pos("box")
        return {
            "reward": reward,
            "object_height_m": float(cube[2]),
            "right_gripper_to_object_m": float(np.linalg.norm(self._gripper_pos("right") - cube)),
            "left_gripper_to_object_m": float(np.linalg.norm(self._gripper_pos("left") - cube)),
        }

    def failure_label(self, max_reward: float, signals: dict[str, list[float]]) -> str:
        return {
            0: "right gripper never touched the cube",
            1: "touched the cube but did not lift it",
            2: "lifted the cube but the left gripper never reached it",
            3: "handover started but the cube was not lifted clear",
        }.get(int(max_reward), super().failure_label(max_reward, signals))


@register_env
class AlohaInsertion(_AlohaBase):
    id: ClassVar[str] = "aloha/insertion"
    task_description: ClassVar[str] = (
        "Pick up the peg and the socket, then insert the peg into the socket."
    )
    xml_name: ClassVar[str] = "bimanual_viperx_insertion.xml"
    n_objects: ClassVar[int] = 2
    scene: ClassVar[SceneMap] = SceneMap(
        object_geoms=["red_peg", "socket-1", "socket-2", "socket-3", "socket-4", "pin"],
        object_bodies=["peg", "socket"],
        surface_geoms=["table"],
        robot_geom_prefixes=["vx300s_"],
        finger_geom_markers=_FINGERS,
        distractor_region=(-0.30, 0.30, 0.38, 0.82, 0.0),
        keep_clear=[
            (0.15, 0.50, 0.17),
            (-0.15, 0.50, 0.17),
            (-0.469, 0.5, 0.12),
            (0.469, 0.5, 0.12),
        ],
    )

    def _make_task(self):
        return aloha_sim.InsertionTask()

    def _nominal_pose(self, seed: int) -> np.ndarray:
        return np.concatenate(sample_insertion_pose(seed))

    def _signals(self, reward: float) -> dict[str, float]:
        peg, socket = self._object_pos("peg"), self._object_pos("socket")
        return {
            "reward": reward,
            "peg_height_m": float(peg[2]),
            "socket_height_m": float(socket[2]),
            "peg_to_socket_m": float(np.linalg.norm(peg - socket)),
            "right_gripper_to_peg_m": float(np.linalg.norm(self._gripper_pos("right") - peg)),
            "left_gripper_to_socket_m": float(np.linalg.norm(self._gripper_pos("left") - socket)),
        }

    def failure_label(self, max_reward: float, signals: dict[str, list[float]]) -> str:
        return {
            0: "did not grasp both the peg and the socket",
            1: "touched both parts but did not lift them",
            2: "lifted both parts but never brought them together",
            3: "peg reached the socket but was not inserted",
        }.get(int(max_reward), super().failure_label(max_reward, signals))
