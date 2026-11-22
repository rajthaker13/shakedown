import textwrap

import pytest

from shakedown.perturbations import PerturbationError, build, build_all, registry
from shakedown.scenario import Scenario, ScenarioError, expand, load_scenario, load_suite


def write(tmp_path, name, body):
    path = tmp_path / name
    path.write_text(textwrap.dedent(body))
    return path


BASIC = """
    version: 1
    name: lighting
    env: aloha/transfer_cube
    episodes: 5
    perturbations:
      - lighting: { intensity: 0.5 }
    assertions:
      success_rate: { min: 0.7 }
"""


def test_loads_a_scenario(tmp_path):
    item = load_scenario(write(tmp_path, "a.yaml", BASIC))
    assert item.scenario.name == "lighting"
    (condition,) = expand(item.scenario)
    assert condition.key == "lighting"
    assert condition.seeds() == [1000, 1001, 1002, 1003, 1004]


def test_sweep_expands_and_keeps_native_types(tmp_path):
    item = load_scenario(
        write(
            tmp_path,
            "s.yaml",
            """
            version: 1
            name: pan
            env: aloha/transfer_cube
            sweep: { name: deg, values: [1, 2.5] }
            perturbations:
              - camera_pose: { camera: top, pan_deg: "${deg}" }
            """,
        )
    )
    conditions = expand(item.scenario)
    assert [c.key for c in conditions] == ["pan@1", "pan@2.5"]
    assert conditions[1].perturbations[0]["camera_pose"]["pan_deg"] == 2.5
    assert build_all(conditions[0].perturbations)[0].pan_deg == 1.0


def test_fingerprint_depends_only_on_what_affects_outcomes():
    a = Scenario(name="a", env="pusht", episodes=5)
    b = Scenario(name="b", env="pusht", episodes=5, description="different words")
    c = Scenario(name="a", env="pusht", episodes=6)
    d = Scenario(name="a", env="pusht", episodes=5, seed=7)
    fp = lambda s: expand(s)[0].fingerprint()
    assert fp(a) == fp(b)
    assert fp(a) != fp(c)
    assert fp(a) != fp(d)


@pytest.mark.parametrize(
    "body, message",
    [
        ("name: Bad Name\nenv: pusht\n", "name must be"),
        ("name: a\nenv: pusht\nepisodes: 0\n", "episodes"),
        ("name: a\nenv: pusht\nunknown_field: 1\n", "unknown_field"),
        ("name: a\nenv: pusht\nsweep: {name: x, values: [1]}\n", "never referenced"),
        ("name: a\nenv: pusht\nperturbations:\n  - image_noise: {std: '${x}'}\n", "no sweep"),
        ("name: a\nenv: pusht\nassertions:\n  regression: {confidence: 95}\n", "confidence"),
        (
            "name: a\nenv: pusht\nassertions:\n  no_contact: {between: table, and: robot}\n",
            "between",
        ),
        ("name: a\nenv: pusht\nassertions:\n  success_rate: {min: 1.5}\n", "min"),
    ],
)
def test_rejects_malformed_scenarios(tmp_path, body, message):
    with pytest.raises(ScenarioError) as excinfo:
        load_scenario(write(tmp_path, "bad.yaml", body))
    assert message in str(excinfo.value)


def test_suite_rejects_duplicate_names(tmp_path):
    write(tmp_path, "a.yaml", BASIC)
    write(tmp_path, "b.yaml", BASIC)
    with pytest.raises(ScenarioError, match="duplicate scenario name"):
        load_suite(tmp_path)


def test_suite_needs_files(tmp_path):
    with pytest.raises(ScenarioError, match="no scenario files"):
        load_suite(tmp_path)


def test_unknown_perturbation_names_the_known_ones():
    with pytest.raises(PerturbationError, match="unknown perturbation 'fog'"):
        build({"fog": {}})


def test_perturbation_rejects_unknown_parameters():
    with pytest.raises(PerturbationError):
        build({"lighting": {"brightness": 2}})


def test_every_perturbation_has_a_summary():
    for name, cls in registry().items():
        assert cls.summary, name
        assert cls.kind in ("sim", "io")


def test_the_bundled_suite_is_valid():
    from pathlib import Path

    suite = Path(__file__).resolve().parents[2] / "scenarios" / "aloha-transfer-cube"
    loaded = load_suite(suite)
    assert len(loaded) >= 10
    for item in loaded:
        for condition in expand(item.scenario):
            build_all(condition.perturbations)


def test_object_table_contact_cannot_be_asserted(tmp_path):
    body = "name: a\nenv: pusht\nassertions:\n  no_contact: {between: object, and: table}\n"
    with pytest.raises(ScenarioError, match="not tracked"):
        load_scenario(write(tmp_path, "c.yaml", body))


def test_fingerprint_follows_the_contents_of_a_scanned_scene(tmp_path):
    scene = tmp_path / "scene"
    scene.mkdir()
    (scene / "scene.json").write_text("{}")
    (scene / "visual.obj").write_text("v 0 0 0\n")
    scenario = Scenario(
        name="a",
        env="aloha/transfer_cube",
        perturbations=[{"scanned_scene": {"path": str(scene)}}],
    )
    before = expand(scenario)[0].fingerprint()
    assert expand(scenario)[0].fingerprint() == before
    (scene / "visual.obj").write_text("v 1 1 1\n")
    assert expand(scenario)[0].fingerprint() != before
