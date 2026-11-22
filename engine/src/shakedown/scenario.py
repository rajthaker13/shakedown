"""Scenario files: the durable unit of a robot policy regression test.

A scenario names an environment, a set of perturbations applied to it, how
many seeded episodes to run, and the assertions that decide the verdict. A
scenario with a `sweep` expands into one condition per swept value, so a
single file can locate the threshold at which a policy breaks.
"""

from __future__ import annotations

import copy
import hashlib
import json
import re
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SCHEMA_VERSION = 1
_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
_TEMPLATE_RE = re.compile(r"\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}")


class ScenarioError(ValueError):
    """Raised when a scenario file is malformed."""


class SuccessRateAssertion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    min: float = Field(ge=0, le=1)


class RegressionAssertion(BaseModel):
    """Fail when the candidate is worse than the baseline by more than `max_drop`."""

    model_config = ConfigDict(extra="forbid")
    max_drop: float = Field(default=0.05, ge=0, le=1)
    confidence: Literal[0.8, 0.9, 0.95, 0.99] = 0.95


class NoContactAssertion(BaseModel):
    """Fail when any episode has contact between the two named groups."""

    model_config = ConfigDict(extra="forbid")
    #: What moves: the robot's links, its gripper fingers, or the task object.
    between: Literal["robot", "gripper", "object"] = "robot"
    #: What it must not touch.
    and_: Literal["table", "distractor", "scene"] = Field(default="table", alias="and")
    #: Fraction of episodes allowed to violate before the assertion fails.
    max_violation_rate: float = Field(default=0.0, ge=0, le=1)

    @model_validator(mode="after")
    def _pair_is_reported(self) -> NoContactAssertion:
        if self.between == "object" and self.and_ == "table":
            raise ValueError(
                "the task object rests on the table, so object:table contact is not tracked"
            )
        return self


class MaxStepsAssertion(BaseModel):
    """Fail when successful episodes take longer than `mean` steps on average."""

    model_config = ConfigDict(extra="forbid")
    mean: float = Field(gt=0)


class Assertions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    success_rate: SuccessRateAssertion | None = None
    regression: RegressionAssertion | None = None
    no_contact: NoContactAssertion | None = None
    max_steps: MaxStepsAssertion | None = None


class Sweep(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    values: list[float | int | str]

    @field_validator("values")
    @classmethod
    def _non_empty(cls, v: list[Any]) -> list[Any]:
        if not v:
            raise ValueError("sweep.values must not be empty")
        return v


class Scenario(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = 1
    name: str
    description: str = ""
    env: str
    episodes: int = Field(default=50, ge=1, le=100_000)
    seed: int = Field(default=1000, ge=0)
    max_steps: int | None = Field(default=None, ge=1)
    #: Each entry is a single-key mapping: {perturbation_name: {params}}.
    perturbations: list[dict[str, dict[str, Any]]] = Field(default_factory=list)
    sweep: Sweep | None = None
    assertions: Assertions = Field(default_factory=Assertions)
    tags: list[str] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def _valid_name(cls, v: str) -> str:
        if not _NAME_RE.match(v):
            raise ValueError("name must be lowercase letters, digits, dots, dashes or underscores")
        return v

    @field_validator("perturbations", mode="before")
    @classmethod
    def _normalize_perturbations(cls, v: Any) -> Any:
        if v is None:
            return []
        out = []
        for item in v:
            if isinstance(item, str):
                out.append({item: {}})
            elif isinstance(item, dict) and len(item) == 1:
                key, params = next(iter(item.items()))
                out.append({key: params or {}})
            else:
                raise ValueError(
                    "each perturbation must be a single-key mapping, e.g. "
                    "`- lighting: { intensity: 0.4 }`"
                )
        return out

    @model_validator(mode="after")
    def _sweep_is_used(self) -> Scenario:
        used = set(_TEMPLATE_RE.findall(json.dumps(self.perturbations)))
        if self.sweep is None and used:
            raise ValueError(
                f"perturbations reference ${{{sorted(used)[0]}}} but no sweep is defined"
            )
        if self.sweep is not None:
            if self.sweep.name not in used:
                raise ValueError(
                    f"sweep '{self.sweep.name}' is never referenced; "
                    f"use ${{{self.sweep.name}}} inside a perturbation"
                )
            unknown = used - {self.sweep.name}
            if unknown:
                raise ValueError(f"unknown template variable ${{{sorted(unknown)[0]}}}")
        return self


class Condition(BaseModel):
    """One row of the result matrix: a scenario with its sweep value resolved."""

    scenario: str
    #: Unique within a suite. `scenario` for plain scenarios, `scenario@value` for sweeps.
    key: str
    label: str
    description: str
    env: str
    episodes: int
    seed: int
    max_steps: int | None
    perturbations: list[dict[str, dict[str, Any]]]
    sweep_name: str | None = None
    sweep_value: float | int | str | None = None
    assertions: Assertions
    tags: list[str] = Field(default_factory=list)

    def seeds(self) -> list[int]:
        return [self.seed + i for i in range(self.episodes)]

    def fingerprint(self) -> str:
        """Stable hash of everything that affects episode outcomes.

        Two runs are only compared as a paired regression when their
        fingerprints match, which guarantees identical seeds and conditions.
        """
        payload: dict[str, Any] = {
            "env": self.env,
            "episodes": self.episodes,
            "seed": self.seed,
            "max_steps": self.max_steps,
            "perturbations": self.perturbations,
        }
        scenes = _scene_digests(self.perturbations)
        if scenes:
            payload["scenes"] = scenes
        blob = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(blob.encode()).hexdigest()[:16]


def _scene_digests(perturbations: list[dict[str, dict[str, Any]]]) -> list[str]:
    """Hash the contents of any scanned scene, so that re-importing a scan into the
    same directory is not mistaken for the same conditions."""
    out = []
    for entry in perturbations:
        params = entry.get("scanned_scene")
        if not params or "path" not in params:
            continue
        root = Path(str(params["path"])).expanduser()
        digest = hashlib.sha256()
        for file in sorted(root.glob("*.obj")) + [root / "scene.json"]:
            if file.is_file():
                digest.update(file.name.encode())
                digest.update(file.read_bytes())
        out.append(digest.hexdigest()[:16])
    return out


def _substitute(node: Any, name: str, value: Any) -> Any:
    if isinstance(node, dict):
        return {k: _substitute(v, name, value) for k, v in node.items()}
    if isinstance(node, list):
        return [_substitute(v, name, value) for v in node]
    if isinstance(node, str):
        whole = _TEMPLATE_RE.fullmatch(node)
        if whole and whole.group(1) == name:
            return value  # keep the native type when the string is only the template
        return _TEMPLATE_RE.sub(lambda m: str(value) if m.group(1) == name else m.group(0), node)
    return node


def expand(scenario: Scenario) -> list[Condition]:
    base = dict(
        scenario=scenario.name,
        description=scenario.description,
        env=scenario.env,
        episodes=scenario.episodes,
        seed=scenario.seed,
        max_steps=scenario.max_steps,
        assertions=scenario.assertions,
        tags=scenario.tags,
    )
    if scenario.sweep is None:
        return [
            Condition(
                key=scenario.name,
                label=scenario.name,
                perturbations=copy.deepcopy(scenario.perturbations),
                **base,
            )
        ]
    out = []
    for value in scenario.sweep.values:
        out.append(
            Condition(
                key=f"{scenario.name}@{value}",
                label=f"{scenario.name} · {scenario.sweep.name}={value}",
                perturbations=_substitute(scenario.perturbations, scenario.sweep.name, value),
                sweep_name=scenario.sweep.name,
                sweep_value=value,
                **base,
            )
        )
    return out


class LoadedScenario(BaseModel):
    scenario: Scenario
    path: str
    source: str


def load_scenario(path: str | Path) -> LoadedScenario:
    path = Path(path)
    source = path.read_text()
    try:
        raw = yaml.safe_load(source)
    except yaml.YAMLError as exc:
        raise ScenarioError(f"{path}: invalid YAML: {exc}") from exc
    if not isinstance(raw, dict):
        raise ScenarioError(f"{path}: expected a mapping at the top level")
    try:
        scenario = Scenario.model_validate(raw)
    except Exception as exc:  # pydantic.ValidationError
        raise ScenarioError(f"{path}: {exc}") from exc
    return LoadedScenario(scenario=scenario, path=str(path), source=source)


def load_suite(path: str | Path) -> list[LoadedScenario]:
    """Load one scenario file, or every `*.yaml` / `*.yml` under a directory."""
    path = Path(path)
    if path.is_file():
        return [load_scenario(path)]
    if not path.is_dir():
        raise ScenarioError(f"{path}: no such file or directory")
    files = sorted(p for p in path.rglob("*") if p.suffix in (".yaml", ".yml"))
    if not files:
        raise ScenarioError(f"{path}: no scenario files found")
    loaded = [load_scenario(p) for p in files]
    seen: dict[str, str] = {}
    for item in loaded:
        if item.scenario.name in seen:
            raise ScenarioError(
                f"duplicate scenario name '{item.scenario.name}' in "
                f"{seen[item.scenario.name]} and {item.path}"
            )
        seen[item.scenario.name] = item.path
    return loaded
