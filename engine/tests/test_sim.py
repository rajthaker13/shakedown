"""Tests that need the simulator. Run with: pytest -m sim"""

import threading
import time

import numpy as np
import pytest

pytestmark = pytest.mark.sim

mujoco = pytest.importorskip("mujoco")
pytest.importorskip("gym_aloha")

from shakedown.envs import UnsupportedPerturbation, get_env_class
from shakedown.perturbations import SimPerturbation, build, build_all
from shakedown.policies.random import RandomPolicy
from shakedown.runner import run_episode

ENV = "aloha/transfer_cube"


def make(*specs):
    perturbations = [p for p in build_all(list(specs)) if isinstance(p, SimPerturbation)]
    return get_env_class(ENV)(perturbations)


def first_image(env, seed=1000):
    return env.reset(seed).images["top"].astype(np.int16)


@pytest.fixture(scope="module")
def nominal_image():
    env = make()
    try:
        return first_image(env)
    finally:
        env.close()


@pytest.mark.parametrize(
    "spec",
    [
        {"lighting": {"intensity": 0.4, "ambient": 0.4}},
        {"lighting": {"tint": [1.0, 0.8, 0.6]}},
        {"camera_pose": {"camera": "top", "pan_deg": 4}},
        {"camera_pose": {"camera": "top", "translate_cm": [3, 0, 0]}},
        {"camera_pose": {"camera": "top", "fov_delta_deg": -10}},
        {"object_pose": {"offset_cm": [0, 6]}},
        {"object_appearance": {"color": [0.1, 0.3, 0.9]}},
        {"object_appearance": {"size_scale": 1.5}},
        {"surface_appearance": {"color": [0.6, 0.5, 0.4]}},
        {"distractors": {"count": 4, "layout_seed": 3}},
    ],
    ids=lambda s: f"{next(iter(s))}:{','.join(next(iter(s.values())))}",
)
def test_visible_perturbations_change_what_the_policy_sees(spec, nominal_image):
    env = make(spec)
    try:
        image = first_image(env)
    finally:
        env.close()
    changed = (np.abs(image - nominal_image).max(axis=2) > 8).mean()
    # The cube covers about 0.1% of the image, so the bar has to be below that.
    assert changed > 0.0005, f"{spec} changed only {changed:.4%} of pixels"


def test_dimmer_lighting_darkens_the_image(nominal_image):
    env = make({"lighting": {"intensity": 0.4, "ambient": 0.4}})
    try:
        assert first_image(env).mean() < nominal_image.mean() * 0.8
    finally:
        env.close()


def test_object_pose_moves_the_object_by_the_requested_amount():
    a, b = make(), make({"object_pose": {"offset_cm": [2, -5]}})
    try:
        a.reset(1003)
        b.reset(1003)
        delta = b._object_pos("box") - a._object_pos("box")
    finally:
        a.close()
        b.close()
    assert delta[0] == pytest.approx(0.02, abs=1e-3)
    assert delta[1] == pytest.approx(-0.05, abs=1e-3)


def test_physics_perturbations_change_the_model():
    base = make()
    heavy = make({"object_physics": {"mass_scale": 3.0, "friction_scale": 0.5}})
    soft = make({"actuator_gain": {"scale": 0.5}})
    damped = make({"joint_damping": {"scale": 4.0, "add": 0.5}})
    try:
        m0 = base._physics.model.ptr
        box = mujoco.mj_name2id(m0, mujoco.mjtObj.mjOBJ_BODY, "box")
        geom = mujoco.mj_name2id(m0, mujoco.mjtObj.mjOBJ_GEOM, "red_box")
        mh = heavy._physics.model.ptr
        assert mh.body_mass[box] == pytest.approx(3 * m0.body_mass[box])
        assert mh.geom_friction[geom][0] == pytest.approx(0.5 * m0.geom_friction[geom][0])
        ms = soft._physics.model.ptr
        assert np.allclose(ms.actuator_gainprm[:, 0], 0.5 * m0.actuator_gainprm[:, 0])
        assert np.allclose(ms.actuator_biasprm[:, 1], 0.5 * m0.actuator_biasprm[:, 1])
        md = damped._physics.model.ptr
        # This model has no joint damping of its own, so only the added term shows.
        assert np.allclose(md.dof_damping[:16], 4 * m0.dof_damping[:16] + 0.5)
        assert np.allclose(md.dof_damping[16:], m0.dof_damping[16:])
    finally:
        for env in (base, heavy, soft, damped):
            env.close()


def test_the_same_distractor_layout_is_used_every_time():
    a = make({"distractors": {"count": 5, "layout_seed": 9}})
    b = make({"distractors": {"count": 5, "layout_seed": 9}})
    c = make({"distractors": {"count": 5, "layout_seed": 10}})
    try:
        assert (first_image(a) == first_image(b)).all()
        assert not (first_image(a) == first_image(c)).all()
    finally:
        for env in (a, b, c):
            env.close()


def test_distractors_keep_clear_of_the_object_and_the_arms():
    env = make({"distractors": {"count": 8, "layout_seed": 1}})
    try:
        env.reset(1000)
        model = env._physics.model.ptr
        for i in range(model.nbody):
            name = mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_BODY, i) or ""
            if name.startswith("distractor"):
                x, y = model.body_pos[i][:2]
                for cx, cy, radius in env.scene.keep_clear:
                    assert np.hypot(x - cx, y - cy) > radius
    finally:
        env.close()


def test_unknown_camera_is_reported_clearly():
    with pytest.raises(ValueError, match="no camera named 'ceiling'.*Available:.*top"):
        make({"camera_pose": {"camera": "ceiling"}})


def test_unsupported_perturbation_is_rejected():
    pytest.importorskip("gym_pusht")
    with pytest.raises(UnsupportedPerturbation):
        get_env_class("pusht")([build({"lighting": {}})])
    with pytest.raises(UnsupportedPerturbation, match="size_scale"):
        get_env_class("pusht")([build({"object_appearance": {"size_scale": 2}})])


def test_episodes_are_deterministic():
    def once():
        env = make({"object_pose": {"jitter_cm": 2}})
        try:
            return run_episode(env, RandomPolicy(14), [], 1005, 40, record_frames=False)
        finally:
            env.close()

    a, b = once(), once()
    assert (a.actions == b.actions).all()
    assert a.record.signals == b.record.signals


def test_an_episode_records_signals_and_frames():
    env = make()
    try:
        trace = run_episode(
            env, RandomPolicy(14), [build({"image_noise": {"std": 10}})], 1000, 20, True
        )
    finally:
        env.close()
    record = trace.record
    assert record.steps == 20 and not record.success
    assert {"reward", "object_height_m", "action_change"} <= set(record.signals)
    assert all(len(v) == 20 for v in record.signals.values())
    assert len(trace.frames) == 10 and trace.frames[0].shape[0] == 240
    assert record.failure_label


def test_pusht_runs_and_moves_the_block():
    pytest.importorskip("gym_pusht")
    cls = get_env_class("pusht")
    a, b = cls([]), cls([build({"object_pose": {"offset_cm": [3, 0]}})])
    try:
        a.reset(7)
        b.reset(7)
        dx = b._env.block.position[0] - a._env.block.position[0]
        assert dx == pytest.approx(30, abs=1.5)
        obs, result = a.step(np.array([256.0, 256.0]))
        assert obs.images["image"].shape == (96, 96, 3)
        assert "coverage" in result.signals
    finally:
        a.close()
        b.close()


def test_a_served_policy_matches_the_same_policy_in_process():
    pytest.importorskip("fastapi")
    import uvicorn

    from shakedown.policies.base import PolicyError
    from shakedown.policies.http import HttpPolicy
    from shakedown.policies.server import create_app

    server = uvicorn.Server(
        uvicorn.Config(
            create_app(RandomPolicy(14), "random", 14, token="s3cret"),
            host="127.0.0.1",
            port=8931,
            log_level="error",
        )
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.05)
    try:
        with pytest.raises(PolicyError, match="401"):
            HttpPolicy("http://127.0.0.1:8931")
        remote = HttpPolicy("http://127.0.0.1:8931", token="s3cret")
        env = make()
        try:
            served = run_episode(env, remote, [], 1002, 15, record_frames=False)
            local = run_episode(env, RandomPolicy(14), [], 1002, 15, record_frames=False)
        finally:
            env.close()
            remote.close()
        assert np.allclose(served.actions, local.actions)
        assert served.record.signals["object_height_m"] == local.record.signals["object_height_m"]
    finally:
        server.should_exit = True
        thread.join(timeout=5)


def test_a_scan_can_be_imported_and_placed_around_the_task(tmp_path):
    trimesh = pytest.importorskip("trimesh")
    pytest.importorskip("coacd")
    from shakedown.scan.importer import ScanError, import_scan, load_manifest, render_preview

    # A stand-in for a scanned workcell: a back wall and a shelf, in millimeters, Y up.
    wall = trimesh.creation.box(extents=[1600, 900, 40])
    wall.apply_translation([0, 450, -500])
    shelf = trimesh.creation.box(extents=[500, 30, 250])
    shelf.apply_translation([400, 500, -350])
    source = tmp_path / "cell.obj"
    trimesh.util.concatenate([wall, shelf]).export(source)

    with pytest.raises(ScanError, match="not a plausible workcell"):
        import_scan(source, tmp_path / "bad", scale=1.0, up="y")

    report = import_scan(source, tmp_path / "scene", scale=0.001, up="y")
    assert report.hulls >= 1
    assert report.extent_m[0] == pytest.approx(1.6, abs=0.01)
    assert report.extent_m[2] == pytest.approx(0.9, abs=0.01)
    manifest = load_manifest(tmp_path / "scene")
    assert (tmp_path / "scene" / manifest["visual"]).exists()
    preview = render_preview(tmp_path / "scene", tmp_path / "scene" / "preview.png")
    assert preview.stat().st_size > 1000

    nominal = make()
    scanned = make({"scanned_scene": {"path": str(tmp_path / "scene"), "position": [0, 1.1, 0]}})
    try:
        before, after = first_image(nominal), first_image(scanned)
        assert (np.abs(after - before).max(axis=2) > 8).mean() > 0.01
        model = scanned._physics.model.ptr
        names = [mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_GEOM, i) for i in range(model.ngeom)]
        assert any(n and n.startswith("scan0_hull") for n in names)
        # The task still runs with the scan in place.
        _, result = scanned.step(np.zeros(14))
        assert "reward" in result.signals
    finally:
        nominal.close()
        scanned.close()


def _suite(tmp_path, body):
    import textwrap

    from shakedown.scenario import load_suite

    (tmp_path / "s.yaml").write_text(textwrap.dedent(body))
    return load_suite(tmp_path)


def test_precheck_passes_the_bundled_suite():
    from pathlib import Path

    from shakedown.precheck import check_suite
    from shakedown.scenario import load_suite

    suite = Path(__file__).resolve().parents[2] / "scenarios" / "aloha-transfer-cube"
    checked = check_suite(load_suite(suite))
    assert checked.ok, [str(p) for p in checked.problems]
    assert checked.action_dims == {"aloha/transfer_cube": 14}


@pytest.mark.parametrize(
    "perturbation, message",
    [
        ("camera_pose: { camera: ceiling }", "no camera named 'ceiling'"),
        ("image_noise: { camera: wrist }", "not given a camera named 'wrist'"),
        ("scanned_scene: { path: /nonexistent/scene }", "not an imported scene"),
        ("distractors: { count: 20, size_cm: 20 }", "could not place"),
    ],
)
def test_precheck_finds_problems_before_anything_runs(tmp_path, perturbation, message):
    from shakedown.precheck import check_suite

    checked = check_suite(
        _suite(
            tmp_path,
            f"""
            version: 1
            name: broken
            env: aloha/transfer_cube
            perturbations:
              - {perturbation}
            """,
        )
    )
    assert not checked.ok
    assert message in str(checked.problems[0])
