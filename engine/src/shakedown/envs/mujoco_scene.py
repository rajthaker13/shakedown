"""Generic MuJoCo implementations of the sim perturbations.

Everything here works on a compiled `MjModel` plus a `SceneMap` that names
the parts of the scene a task cares about. Any MuJoCo scene, including one
imported from a workcell scan, can be perturbed by supplying its own map.
"""

from __future__ import annotations

import math
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

import mujoco
import numpy as np

from shakedown.perturbations import sim as P


class UnknownSceneName(ValueError):
    pass


@dataclass
class SceneMap:
    #: Geoms that make up the task object(s).
    object_geoms: list[str]
    #: Bodies that carry the task object(s); used for mass.
    object_bodies: list[str]
    #: Geoms of the work surface.
    surface_geoms: list[str]
    #: Name prefixes identifying robot geoms.
    robot_geom_prefixes: list[str]
    #: Substrings identifying gripper finger geoms, which are expected to touch things.
    finger_geom_markers: list[str] = field(default_factory=list)
    #: Region of the work surface where distractors may be placed: (xmin, xmax, ymin, ymax, z).
    distractor_region: tuple[float, float, float, float, float] = (-0.3, 0.3, 0.35, 0.85, 0.0)
    #: Areas distractors must keep clear of: (x, y, radius).
    keep_clear: list[tuple[float, float, float]] = field(default_factory=list)


# --- quaternion helpers (MuJoCo order: w, x, y, z) ---------------------------------


def quat_mul(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    out = np.zeros(4)
    mujoco.mju_mulQuat(out, np.asarray(a, dtype=float), np.asarray(b, dtype=float))
    return out


def quat_axis_angle(axis: tuple[float, float, float], degrees: float) -> np.ndarray:
    out = np.zeros(4)
    mujoco.mju_axisAngle2Quat(out, np.asarray(axis, dtype=float), math.radians(degrees))
    return out


def mat_to_quat(mat9: np.ndarray) -> np.ndarray:
    out = np.zeros(4)
    mujoco.mju_mat2Quat(out, np.asarray(mat9, dtype=float).reshape(9))
    return out


def _id(model: mujoco.MjModel, kind: mujoco.mjtObj, name: str) -> int:
    idx = mujoco.mj_name2id(model, kind, name)
    if idx < 0:
        what = kind.name[6:].lower()
        known = [
            mujoco.mj_id2name(model, kind, i)
            for i in range(
                {"camera": model.ncam, "geom": model.ngeom, "body": model.nbody}.get(what, 0)
            )
        ]
        raise UnknownSceneName(
            f"no {what} named '{name}' in this scene. "
            f"Available: {', '.join(n for n in known if n) or 'none'}"
        )
    return idx


# --- model-level perturbations -----------------------------------------------------


def apply_lighting(model: mujoco.MjModel, p: P.Lighting) -> None:
    tint = np.asarray(p.tint, dtype=float)
    model.light_diffuse[:] = np.clip(model.light_diffuse * p.intensity * tint, 0, 1)
    model.light_specular[:] = np.clip(model.light_specular * p.intensity * tint, 0, 1)
    model.light_ambient[:] = np.clip(model.light_ambient * p.ambient * tint, 0, 1)
    head = model.vis.headlight
    head.ambient[:] = np.clip(np.asarray(head.ambient) * p.ambient * tint, 0, 1)
    head.diffuse[:] = np.clip(np.asarray(head.diffuse) * p.intensity * tint, 0, 1)
    head.specular[:] = np.clip(np.asarray(head.specular) * p.intensity * tint, 0, 1)


def apply_camera_pose(model: mujoco.MjModel, data: mujoco.MjData, p: P.CameraPose) -> None:
    """Move a camera as if its mount had been bumped.

    Cameras that track a target body are first frozen at their nominal
    orientation. Otherwise the tracking would re-aim the camera and hide the
    effect of the translation.
    """
    cam = _id(model, mujoco.mjtObj.mjOBJ_CAMERA, p.camera)
    mujoco.mj_forward(model, data)
    parent = model.cam_bodyid[cam]
    base_quat = mat_to_quat(data.cam_xmat[cam])
    if parent != 0:
        # Body-mounted camera (e.g. a wrist camera): express the nominal
        # orientation in the parent body's frame so it keeps moving with the body.
        inv_parent = np.zeros(4)
        mujoco.mju_negQuat(inv_parent, data.xquat[parent])
        base_quat = quat_mul(inv_parent, base_quat)
    model.cam_mode[cam] = mujoco.mjtCamLight.mjCAMLIGHT_FIXED
    model.cam_targetbodyid[cam] = -1

    # MuJoCo cameras look along -Z with +X right and +Y up.
    rot = quat_axis_angle((0, 1, 0), p.pan_deg)
    rot = quat_mul(rot, quat_axis_angle((1, 0, 0), p.tilt_deg))
    rot = quat_mul(rot, quat_axis_angle((0, 0, 1), p.roll_deg))
    model.cam_quat[cam] = quat_mul(base_quat, rot)
    model.cam_pos[cam] = model.cam_pos[cam] + np.asarray(p.translate_cm, dtype=float) / 100.0
    if p.fov_delta_deg:
        model.cam_fovy[cam] = float(np.clip(model.cam_fovy[cam] + p.fov_delta_deg, 5.0, 170.0))


def apply_object_appearance(model: mujoco.MjModel, scene: SceneMap, p: P.ObjectAppearance) -> None:
    for name in scene.object_geoms:
        g = _id(model, mujoco.mjtObj.mjOBJ_GEOM, name)
        if p.color is not None:
            model.geom_rgba[g, :3] = np.asarray(p.color, dtype=float)
            # A material would override rgba; detach it so the color takes effect.
            model.geom_matid[g] = -1
        if p.size_scale != 1.0:
            model.geom_size[g] = model.geom_size[g] * p.size_scale
            model.geom_rbound[g] = model.geom_rbound[g] * p.size_scale
            model.geom_aabb[g] = model.geom_aabb[g] * p.size_scale


def apply_object_physics(model: mujoco.MjModel, scene: SceneMap, p: P.ObjectPhysics) -> None:
    for name in scene.object_bodies:
        b = _id(model, mujoco.mjtObj.mjOBJ_BODY, name)
        model.body_mass[b] = model.body_mass[b] * p.mass_scale
        model.body_inertia[b] = model.body_inertia[b] * p.mass_scale
    for name in scene.object_geoms:
        g = _id(model, mujoco.mjtObj.mjOBJ_GEOM, name)
        model.geom_friction[g] = model.geom_friction[g] * p.friction_scale


def apply_surface_appearance(
    model: mujoco.MjModel, scene: SceneMap, p: P.SurfaceAppearance
) -> None:
    for name in scene.surface_geoms:
        g = _id(model, mujoco.mjtObj.mjOBJ_GEOM, name)
        model.geom_rgba[g, :3] = np.asarray(p.color, dtype=float)
        model.geom_matid[g] = -1


def apply_actuator_gain(model: mujoco.MjModel, p: P.ActuatorGain) -> None:
    # Position actuators: force = kp * (ctrl - qpos), stored as gainprm[0] = kp, biasprm[1] = -kp.
    model.actuator_gainprm[:, 0] = model.actuator_gainprm[:, 0] * p.scale
    model.actuator_biasprm[:, 1] = model.actuator_biasprm[:, 1] * p.scale


def apply_joint_damping(model: mujoco.MjModel, p: P.JointDamping) -> None:
    hinge_or_slide = np.isin(
        model.jnt_type, [mujoco.mjtJoint.mjJNT_HINGE, mujoco.mjtJoint.mjJNT_SLIDE]
    )
    for j in np.nonzero(hinge_or_slide)[0]:
        dof = model.jnt_dofadr[j]
        model.dof_damping[dof] = model.dof_damping[dof] * p.scale + p.add


def apply_model_perturbation(
    model: mujoco.MjModel, data: mujoco.MjData, scene: SceneMap, p: P.SimPerturbation
) -> bool:
    """Apply a perturbation that only needs the compiled model. Returns False if not handled."""
    if isinstance(p, P.Lighting):
        apply_lighting(model, p)
    elif isinstance(p, P.CameraPose):
        apply_camera_pose(model, data, p)
    elif isinstance(p, P.ObjectAppearance):
        apply_object_appearance(model, scene, p)
    elif isinstance(p, P.ObjectPhysics):
        apply_object_physics(model, scene, p)
    elif isinstance(p, P.SurfaceAppearance):
        apply_surface_appearance(model, scene, p)
    elif isinstance(p, P.ActuatorGain):
        apply_actuator_gain(model, p)
    elif isinstance(p, P.JointDamping):
        apply_joint_damping(model, p)
    else:
        return False
    return True


# --- scene-level perturbations (edit the MJCF before it is compiled) ---------------

_PALETTE = [
    (0.10, 0.45, 0.85),
    (0.95, 0.75, 0.10),
    (0.15, 0.65, 0.30),
    (0.85, 0.35, 0.75),
    (0.95, 0.50, 0.10),
    (0.20, 0.75, 0.80),
    (0.60, 0.60, 0.60),
    (0.45, 0.25, 0.10),
]


def distractor_elements(
    p: P.Distractors, scene: SceneMap, prefix: str = "distractor"
) -> list[ET.Element]:
    """Build static distractor bodies placed without overlap on the work surface."""
    rng = np.random.default_rng(p.layout_seed)
    xmin, xmax, ymin, ymax, z = scene.distractor_region
    half = p.size_cm / 100.0
    placed: list[tuple[float, float, float]] = list(scene.keep_clear)
    shapes = ["box", "sphere", "cylinder"]
    out: list[ET.Element] = []
    for i in range(p.count):
        for _attempt in range(200):
            x = float(rng.uniform(xmin + half, xmax - half))
            y = float(rng.uniform(ymin + half, ymax - half))
            if all(math.hypot(x - px, y - py) > pr + half * 1.6 for px, py, pr in placed):
                break
        else:
            raise ValueError(
                f"could not place {p.count} distractors of {p.size_cm} cm without overlap"
            )
        placed.append((x, y, half * 1.6))
        shape = shapes[int(rng.integers(0, 3))] if p.shape == "mixed" else p.shape
        color = p.color if p.color is not None else _PALETTE[int(rng.integers(0, len(_PALETTE)))]
        body = ET.Element("body", name=f"{prefix}_{i}", pos=f"{x:.4f} {y:.4f} {z + half:.4f}")
        size = {
            "box": f"{half:.4f} {half:.4f} {half:.4f}",
            "sphere": f"{half:.4f}",
            "cylinder": f"{half:.4f} {half:.4f}",
        }[shape]
        ET.SubElement(
            body,
            "geom",
            name=f"{prefix}_{i}_geom",
            type=shape,
            size=size,
            rgba=f"{color[0]:.3f} {color[1]:.3f} {color[2]:.3f} 1",
        )
        out.append(body)
    return out


def scanned_scene_elements(p: P.ScannedScene, index: int) -> tuple[list[ET.Element], ET.Element]:
    """Mesh assets and a static body for an imported scan."""
    from pathlib import Path

    from shakedown.scan.importer import load_manifest

    root = Path(p.path).expanduser().resolve()
    manifest = load_manifest(root)
    prefix = f"scan{index}"
    assets = [ET.Element("mesh", name=f"{prefix}_visual", file=str(root / manifest["visual"]))]
    r, g, b = manifest["color"]
    quat = quat_axis_angle((0, 0, 1), p.yaw_deg)
    body = ET.Element(
        "body",
        name=prefix,
        pos=" ".join(f"{v:.4f}" for v in p.position),
        quat=" ".join(f"{v:.6f}" for v in quat),
    )
    ET.SubElement(
        body,
        "geom",
        name=f"{prefix}_visual",
        type="mesh",
        mesh=f"{prefix}_visual",
        rgba=f"{r} {g} {b} 1",
        contype="0",
        conaffinity="0",
        group="1",
    )
    if p.collide:
        for hull in manifest["hulls"]:
            stem = Path(hull).stem
            assets.append(ET.Element("mesh", name=f"{prefix}_{stem}", file=str(root / hull)))
            ET.SubElement(
                body,
                "geom",
                name=f"{prefix}_{stem}",
                type="mesh",
                mesh=f"{prefix}_{stem}",
                rgba="0 0 0 0",
                group="3",
            )
    return assets, body


# --- contact queries ---------------------------------------------------------------


def contact_groups(model: mujoco.MjModel, data: mujoco.MjData, scene: SceneMap) -> set[str]:
    """Classify the contacts active this step into named groups.

    Returns a subset of {"robot:table", "gripper:table", "robot:distractor",
    "gripper:distractor", "object:distractor", "robot:scene", "gripper:scene",
    "object:scene"}. Gripper fingers are reported
    separately from the rest of the robot because fingers brushing the work
    surface is normal during a grasp, while an arm link hitting it is not.
    """
    groups: set[str] = set()
    surface = set(scene.surface_geoms)
    objects = set(scene.object_geoms)
    for i in range(data.ncon):
        c = data.contact[i]
        if c.dist > 0:
            continue
        a = mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_GEOM, c.geom1) or ""
        b = mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_GEOM, c.geom2) or ""
        kinds = []
        for n in (a, b):
            if n in surface:
                kinds.append("table")
            elif n in objects:
                kinds.append("object")
            elif n.startswith("distractor"):
                kinds.append("distractor")
            elif n.startswith("scan"):
                kinds.append("scene")
            elif any(n.startswith(pre) for pre in scene.robot_geom_prefixes):
                is_finger = any(mark in n for mark in scene.finger_geom_markers)
                kinds.append("gripper" if is_finger else "robot")
            else:
                kinds.append("other")
        pair = set(kinds)
        for mover in ("robot", "gripper", "object"):
            for target in ("table", "distractor", "scene"):
                if pair == {mover, target} and not (mover == "object" and target == "table"):
                    groups.add(f"{mover}:{target}")
    return groups
