"""Turn a scanned mesh of a real workcell into a MuJoCo scene.

Phone scanning apps export a textured mesh (OBJ, GLB or PLY). MuJoCo needs
two things from it: a visual mesh, and collision geometry made of convex
pieces. This module produces both, and a manifest that the `scanned_scene`
perturbation reads to place the scan around a task.

What this does not do: recover materials, articulation or mass. A scan gives
the shape and color of the surroundings. Objects the robot manipulates
still come from the task's own model.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

MANIFEST = "scene.json"
#: MuJoCo limits the number of faces in a single mesh it will load quickly.
MAX_VISUAL_FACES = 150_000


class ScanError(ValueError):
    pass


@dataclass
class ImportReport:
    out_dir: Path
    visual_faces: int
    hulls: int
    extent_m: tuple[float, float, float]
    color: tuple[float, float, float]
    watertight: bool


def _load(path: Path):
    try:
        import trimesh
    except ImportError as exc:
        raise ScanError(
            "the scan tools are not installed. From the repository, run: pip install -e 'engine[scan]'"
        ) from exc
    try:
        loaded = trimesh.load(str(path), force="mesh", process=True)
    except Exception as exc:
        raise ScanError(f"could not read {path}: {exc}") from exc
    if not hasattr(loaded, "faces") or len(loaded.faces) == 0:
        raise ScanError(f"{path} contains no triangles")
    return loaded


def _mean_color(mesh) -> tuple[float, float, float]:
    """Average surface color. MuJoCo cannot use a scan's texture atlas directly."""
    try:
        visual = mesh.visual
        if visual.kind == "texture":
            visual = visual.to_color()
        colors = np.asarray(visual.vertex_colors, dtype=float)[:, :3]
        if len(colors):
            r, g, b = (colors.mean(axis=0) / 255.0).tolist()
            return (round(r, 3), round(g, 3), round(b, 3))
    except Exception:
        pass
    return (0.6, 0.6, 0.6)


def import_scan(
    source: str | Path,
    out_dir: str | Path,
    *,
    scale: float = 1.0,
    up: str = "z",
    max_hulls: int = 32,
    threshold: float = 0.05,
    floor_to_zero: bool = True,
) -> ImportReport:
    """Convert a scanned mesh into a scene directory.

    `scale` converts the scan's units to meters. `up` names the axis that
    points upward in the scan; MuJoCo uses Z.
    """
    try:
        import coacd
        import trimesh
    except ImportError as exc:
        raise ScanError(
            "the scan tools are not installed. From the repository, run: pip install -e 'engine[scan]'"
        ) from exc

    source, out_dir = Path(source), Path(out_dir)
    if not source.is_file():
        raise ScanError(f"{source}: no such file")
    if scale <= 0:
        raise ScanError("scale must be positive")
    mesh = _load(source)
    color = _mean_color(mesh)

    mesh.apply_scale(scale)
    if up == "y":
        # Rotate +Y up to +Z up.
        mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    elif up != "z":
        raise ScanError("up must be 'y' or 'z'")

    # Center the scan on the origin in the ground plane, and rest it on z = 0.
    low, high = mesh.bounds
    shift = [-(low[0] + high[0]) / 2, -(low[1] + high[1]) / 2, -low[2] if floor_to_zero else 0.0]
    mesh.apply_translation(shift)
    extent = tuple(float(x) for x in (mesh.bounds[1] - mesh.bounds[0]))
    if max(extent) > 50 or max(extent) < 0.05:
        raise ScanError(
            f"after scaling the scan measures {extent[0]:.2f} x {extent[1]:.2f} x {extent[2]:.2f} m, "
            "which is not a plausible workcell. Check --scale."
        )

    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in out_dir.glob("hull_*.obj"):
        stale.unlink()

    visual = mesh
    if len(mesh.faces) > MAX_VISUAL_FACES:
        try:
            visual = mesh.simplify_quadric_decimation(face_count=MAX_VISUAL_FACES)
        except Exception:
            # Decimation needs an optional dependency. A uniform subsample keeps
            # the scene loadable at the cost of some holes.
            keep = np.linspace(0, len(mesh.faces) - 1, MAX_VISUAL_FACES).astype(int)
            visual = mesh.submesh([keep], append=True)
    # Geometry only: MuJoCo reads positions and faces from OBJ.
    trimesh.Trimesh(vertices=visual.vertices, faces=visual.faces, process=False).export(
        out_dir / "visual.obj"
    )

    coacd.set_log_level("error")
    parts = coacd.run_coacd(
        coacd.Mesh(np.asarray(mesh.vertices, dtype=float), np.asarray(mesh.faces, dtype=np.int32)),
        threshold=threshold,
        max_convex_hull=max_hulls,
    )
    hulls = []
    for i, (vertices, faces) in enumerate(parts):
        if len(vertices) < 4:
            continue
        name = f"hull_{i:03d}.obj"
        trimesh.Trimesh(vertices=vertices, faces=faces, process=False).export(out_dir / name)
        hulls.append(name)
    if not hulls:
        raise ScanError("convex decomposition produced no collision geometry")

    manifest = {
        "version": 1,
        "source": source.name,
        "visual": "visual.obj",
        "hulls": hulls,
        "color": list(color),
        "extent_m": list(extent),
        "scale": scale,
        "up": up,
    }
    (out_dir / MANIFEST).write_text(json.dumps(manifest, indent=2) + "\n")
    write_preview_mjcf(out_dir)
    return ImportReport(
        out_dir=out_dir,
        visual_faces=len(visual.faces),
        hulls=len(hulls),
        extent_m=extent,  # type: ignore[arg-type]
        color=color,
        watertight=bool(mesh.is_watertight),
    )


def load_manifest(scene_dir: str | Path) -> dict:
    path = Path(scene_dir) / MANIFEST
    if not path.is_file():
        raise ScanError(
            f"{scene_dir} is not an imported scene (no {MANIFEST}). "
            "Create one with: shakedown scan import <mesh> --out <dir>"
        )
    manifest = json.loads(path.read_text())
    if manifest.get("version") != 1:
        raise ScanError(f"{path}: unsupported manifest version {manifest.get('version')!r}")
    return manifest


def write_preview_mjcf(scene_dir: str | Path) -> Path:
    """A standalone MJCF of the scan alone, for checking it in a MuJoCo viewer."""
    scene_dir = Path(scene_dir)
    m = load_manifest(scene_dir)
    r, g, b = m["color"]
    lines = [
        '<mujoco model="scan">',
        '  <compiler meshdir="." />',
        '  <visual><headlight ambient="0.5 0.5 0.5" /></visual>',
        "  <asset>",
        f'    <mesh name="scan_visual" file="{m["visual"]}" />',
        *[f'    <mesh name="scan_{Path(h).stem}" file="{h}" />' for h in m["hulls"]],
        "  </asset>",
        "  <worldbody>",
        '    <light pos="0 0 3" dir="0 0 -1" directional="true" />',
        '    <body name="scan">',
        f'      <geom name="scan_visual" type="mesh" mesh="scan_visual" rgba="{r} {g} {b} 1" '
        'contype="0" conaffinity="0" group="1" />',
        *[
            f'      <geom name="scan_{Path(h).stem}" type="mesh" mesh="scan_{Path(h).stem}" '
            'rgba="0 0 0 0" group="3" />'
            for h in m["hulls"]
        ],
        "    </body>",
        "  </worldbody>",
        "</mujoco>",
    ]
    out = scene_dir / "scene.xml"
    out.write_text("\n".join(lines) + "\n")
    return out


def render_preview(
    scene_dir: str | Path, out: str | Path, size: tuple[int, int] = (640, 480)
) -> Path:
    """Render the imported scan from above and to the side, to confirm it loaded correctly."""
    import mujoco
    from PIL import Image

    scene_dir = Path(scene_dir)
    m = load_manifest(scene_dir)
    model = mujoco.MjModel.from_xml_path(str(scene_dir / "scene.xml"))
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)
    renderer = mujoco.Renderer(model, size[1], size[0])
    camera = mujoco.MjvCamera()
    camera.lookat[:] = [0, 0, m["extent_m"][2] / 2]
    camera.distance = 1.6 * max(m["extent_m"])
    camera.azimuth, camera.elevation = 135, -30
    renderer.update_scene(data, camera)
    image = renderer.render()
    renderer.close()
    out = Path(out)
    Image.fromarray(image).save(out)
    return out
