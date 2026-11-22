"""Perturbations of the simulated world.

These classes only declare parameters. Each environment adapter decides how
to realize them, because "move the camera" means something different in
MuJoCo than in a 2D physics engine.
"""

from __future__ import annotations

from typing import ClassVar, Literal

from pydantic import Field

from shakedown.perturbations.base import SimPerturbation, register

Vec3 = tuple[float, float, float]


@register
class Lighting(SimPerturbation):
    name: ClassVar[str] = "lighting"
    summary: ClassVar[str] = "Scene light intensity, ambient level and color tint."

    #: Multiplier on directional light intensity. 1.0 is nominal.
    intensity: float = Field(default=1.0, ge=0, le=10)
    #: Multiplier on ambient light.
    ambient: float = Field(default=1.0, ge=0, le=10)
    #: Per-channel multiplier, e.g. [1.0, 0.85, 0.7] for warm light.
    tint: Vec3 = (1.0, 1.0, 1.0)


@register
class CameraPose(SimPerturbation):
    name: ClassVar[str] = "camera_pose"
    summary: ClassVar[str] = (
        "Camera bumped or remounted: translation, pan, tilt, roll, field of view."
    )

    camera: str = "top"
    #: Translation in the world frame, centimeters.
    translate_cm: Vec3 = (0.0, 0.0, 0.0)
    #: Rotation about the camera's up axis, degrees.
    pan_deg: float = 0.0
    #: Rotation about the camera's right axis, degrees.
    tilt_deg: float = 0.0
    #: Rotation about the viewing axis, degrees.
    roll_deg: float = 0.0
    #: Change in vertical field of view, degrees.
    fov_delta_deg: float = 0.0


@register
class ObjectPose(SimPerturbation):
    name: ClassVar[str] = "object_pose"
    summary: ClassVar[str] = "Shift, rotate or jitter where the task object starts."

    #: Constant offset from the nominal sampled position, centimeters (x, y).
    offset_cm: tuple[float, float] = (0.0, 0.0)
    #: Uniform random offset in [-jitter, +jitter] per episode, centimeters.
    jitter_cm: float = Field(default=0.0, ge=0)
    #: Rotation about the vertical axis, degrees.
    yaw_deg: float = 0.0
    #: Uniform random yaw in [-jitter, +jitter] per episode, degrees.
    yaw_jitter_deg: float = Field(default=0.0, ge=0)


@register
class ObjectAppearance(SimPerturbation):
    name: ClassVar[str] = "object_appearance"
    summary: ClassVar[str] = "Task object color and size."

    #: RGB in 0-1.
    color: Vec3 | None = None
    size_scale: float = Field(default=1.0, gt=0, le=5)


@register
class ObjectPhysics(SimPerturbation):
    name: ClassVar[str] = "object_physics"
    summary: ClassVar[str] = "Task object mass and surface friction."

    mass_scale: float = Field(default=1.0, gt=0, le=100)
    friction_scale: float = Field(default=1.0, gt=0, le=100)


@register
class SurfaceAppearance(SimPerturbation):
    name: ClassVar[str] = "surface_appearance"
    summary: ClassVar[str] = "Work surface color."

    color: Vec3 = (0.2, 0.2, 0.2)


@register
class Distractors(SimPerturbation):
    name: ClassVar[str] = "distractors"
    summary: ClassVar[str] = "Extra objects placed on the work surface."

    count: int = Field(default=3, ge=1, le=20)
    shape: Literal["box", "sphere", "cylinder", "mixed"] = "mixed"
    #: Fixed color for every distractor. Random colors when omitted.
    color: Vec3 | None = None
    #: Half-size of each distractor, centimeters.
    size_cm: float = Field(default=2.0, gt=0, le=20)
    #: Seed for placement. The same layout is used for every episode.
    layout_seed: int = 0


@register
class ActuatorGain(SimPerturbation):
    name: ClassVar[str] = "actuator_gain"
    summary: ClassVar[str] = "Position controller stiffness, as from different or worn motors."

    scale: float = Field(default=1.0, gt=0, le=10)


@register
class JointDamping(SimPerturbation):
    name: ClassVar[str] = "joint_damping"
    summary: ClassVar[str] = "Joint damping, as from temperature or wear."

    #: Multiplier on each joint's damping. Has no effect on joints modeled with none.
    scale: float = Field(default=1.0, ge=0, le=100)
    #: Damping added to every joint after scaling, in N·m·s/rad.
    add: float = Field(default=0.0, ge=0, le=1000)


@register
class ScannedScene(SimPerturbation):
    name: ClassVar[str] = "scanned_scene"
    summary: ClassVar[str] = "Surround the task with a scan of a real workcell."

    #: A scene directory produced by `shakedown scan import`.
    path: str
    #: Where to place the scan's origin in the task's world frame, meters.
    position: Vec3 = (0.0, 0.6, 0.0)
    #: Rotation of the scan about the vertical axis, degrees.
    yaw_deg: float = 0.0
    #: Whether the robot and objects can collide with the scan.
    collide: bool = True
    #: Hide the task's own work surface, when the scan already contains one.
    hide_surface: bool = False
