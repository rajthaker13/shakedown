"""Check a suite before running it.

Every condition's scene is built once and reset once. That catches a
misnamed camera, a missing scan or distractors that do not fit before an
evaluation has spent an hour reaching the condition that uses them.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from shakedown.envs import get_env_class
from shakedown.perturbations import (
    IoPerturbation,
    PerturbationError,
    SimPerturbation,
    build_all,
)
from shakedown.scenario import LoadedScenario, expand


@dataclass
class Problem:
    path: str
    condition: str
    message: str

    def __str__(self) -> str:
        return f"{self.path}: {self.condition}: {self.message}"


@dataclass
class SuiteCheck:
    problems: list[Problem] = field(default_factory=list)
    #: Environment id to the size of its action vector.
    action_dims: dict[str, int] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return not self.problems


def check_suite(
    scenarios: list[LoadedScenario], build_scenes: bool = True, policy=None
) -> SuiteCheck:
    """Check every condition. With a policy, also check it accepts each condition's delay."""
    result = SuiteCheck()
    for item in scenarios:
        try:
            env_cls = get_env_class(item.scenario.env)
        except KeyError as exc:
            result.problems.append(Problem(item.path, item.scenario.name, str(exc).strip("'\"")))
            continue
        for condition in expand(item.scenario):
            try:
                perturbations = build_all(condition.perturbations)
            except PerturbationError as exc:
                result.problems.append(Problem(item.path, condition.key, str(exc)))
                continue
            sim = [p for p in perturbations if isinstance(p, SimPerturbation)]
            unsupported = [p.name for p in sim if p.name not in env_cls.supported]
            if unsupported:
                result.problems.append(
                    Problem(
                        item.path,
                        condition.key,
                        f"'{unsupported[0]}' is not supported by environment '{env_cls.id}'",
                    )
                )
                continue
            if policy is not None:
                delay = sum(
                    getattr(p, "steps", 0) for p in perturbations if p.name == "action_latency"
                )
                try:
                    policy.configure(action_delay_steps=delay)
                except Exception as exc:  # noqa: BLE001
                    result.problems.append(Problem(item.path, condition.key, str(exc)))
                    continue
                finally:
                    try:
                        policy.configure(action_delay_steps=0)
                    except Exception:  # noqa: BLE001, S110
                        pass
            if not build_scenes:
                continue
            try:
                env = env_cls(sim)
            except Exception as exc:  # noqa: BLE001 - any failure to build is the finding
                result.problems.append(Problem(item.path, condition.key, str(exc).strip("'\"")))
                continue
            try:
                result.action_dims[env_cls.id] = env.action_dim()
                cameras = set(env.reset(condition.seed).images)
                for p in perturbations:
                    camera = getattr(p, "camera", None)
                    if isinstance(p, IoPerturbation) and camera and camera not in cameras:
                        result.problems.append(
                            Problem(
                                item.path,
                                condition.key,
                                f"{p.name}: the policy is not given a camera named '{camera}'. "
                                f"It sees: {', '.join(sorted(cameras))}",
                            )
                        )
            except Exception as exc:  # noqa: BLE001
                result.problems.append(Problem(item.path, condition.key, str(exc).strip("'\"")))
            finally:
                env.close()
    return result
