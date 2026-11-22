import numpy as np

from shakedown.perturbations import build
from shakedown.types import Observation


def obs(value=100):
    return Observation(
        images={"top": np.full((48, 64, 3), value, dtype=np.uint8)},
        state=np.zeros(14, dtype=np.float32),
    )


def rng(seed=0):
    return np.random.default_rng(seed)


def test_transforms_do_not_modify_their_input():
    original = obs()
    for spec in (
        {"image_noise": {"std": 20}},
        {"image_adjust": {"brightness": 0.5}},
        {"image_blur": {"radius_px": 2}},
        {"image_occlusion": {}},
        {"image_compression": {"quality": 10}},
        {"proprio_noise": {"std": 0.1}},
    ):
        p = build(spec)
        p.begin_episode(rng())
        p.transform_observation(original, rng(), 0)
        assert (original.images["top"] == 100).all(), spec
        assert (original.state == 0).all(), spec


def test_image_noise_is_seeded_and_bounded():
    p = build({"image_noise": {"std": 30}})
    a = p.transform_observation(obs(250), rng(1), 0).images["top"]
    b = p.transform_observation(obs(250), rng(1), 0).images["top"]
    c = p.transform_observation(obs(250), rng(2), 0).images["top"]
    assert (a == b).all()
    assert not (a == c).all()
    assert a.dtype == np.uint8 and a.max() <= 255


def test_image_adjust_darkens():
    out = build({"image_adjust": {"brightness": 0.5}}).transform_observation(obs(200), rng(), 0)
    assert abs(int(out.images["top"][0, 0, 0]) - 100) <= 1


def test_occlusion_covers_the_requested_area():
    p = build({"image_occlusion": {"center": [0.5, 0.5], "size": [0.5, 0.5]}})
    img = p.transform_observation(obs(), rng(), 0).images["top"]
    assert (img[24, 32] == 0).all()
    assert (img[0, 0] == 100).all()
    assert (img == 0).all(axis=2).mean() == 0.25


def test_unknown_camera_is_an_error():
    p = build({"image_noise": {"camera": "wrist"}})
    try:
        p.transform_observation(obs(), rng(), 0)
    except KeyError as exc:
        assert "wrist" in str(exc)
    else:
        raise AssertionError("expected a KeyError")


def test_action_latency_delays_by_the_given_steps():
    p = build({"action_latency": {"steps": 2}})
    p.begin_episode(rng())
    sent = [
        float(p.transform_action(np.array([i], dtype=np.float32), rng(), i)[0]) for i in range(6)
    ]
    # The first command is held until delayed commands start to arrive.
    assert sent == [0.0, 0.0, 0.0, 1.0, 2.0, 3.0]


def test_action_latency_resets_between_episodes():
    p = build({"action_latency": {"steps": 1}})
    p.begin_episode(rng())
    p.transform_action(np.array([9.0]), rng(), 0)
    p.begin_episode(rng())
    assert float(p.transform_action(np.array([5.0]), rng(), 0)[0]) == 5.0


def test_zero_latency_is_a_no_op():
    p = build({"action_latency": {"steps": 0}})
    p.begin_episode(rng())
    assert float(p.transform_action(np.array([3.0]), rng(), 0)[0]) == 3.0


def test_action_hold_repeats_the_previous_command():
    p = build({"action_hold": {"probability": 1.0}})
    p.begin_episode(rng())
    first = p.transform_action(np.array([1.0]), rng(), 0)
    second = p.transform_action(np.array([2.0]), rng(), 1)
    assert float(first[0]) == 1.0 and float(second[0]) == 1.0


def test_frame_drop_repeats_the_previous_frame():
    p = build({"frame_drop": {"probability": 1.0}})
    p.begin_episode(rng())
    p.transform_observation(obs(10), rng(), 0)
    out = p.transform_observation(obs(200), rng(), 1)
    assert (out.images["top"] == 10).all()
