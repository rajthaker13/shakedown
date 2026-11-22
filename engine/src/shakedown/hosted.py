"""Pieces for running a suite as separate jobs, one condition each.

Used by the cloud runner, where every condition runs in its own container
and the results are put back together afterwards.
"""

from __future__ import annotations

import platform
from collections import Counter
from pathlib import Path
from typing import Any

from shakedown import __version__
from shakedown.runner import RESULT_SCHEMA, RunOptions, SuiteRunner, baseline_from_result
from shakedown.scenario import Condition, expand, load_suite
from shakedown.verdict import worst


def plan(suite_dir: str | Path, episodes: int | None = None) -> list[dict[str, Any]]:
    """Every condition of a suite, nominal ones first, as plain data."""
    out = []
    for item in load_suite(suite_dir):
        for condition in expand(item.scenario):
            if episodes is not None:
                condition = condition.model_copy(update={"episodes": episodes})
            out.append(
                {
                    "key": condition.key,
                    "label": condition.label,
                    "scenario": condition.scenario,
                    "episodes": condition.episodes,
                    "nominal": not condition.perturbations,
                    "condition": condition.model_dump(mode="json"),
                    "source": item.source,
                }
            )
    out.sort(key=lambda c: not c["nominal"])
    return out


def run_one(
    planned: dict[str, Any],
    *,
    policy_spec: str,
    policy_label: str,
    out_dir: str | Path,
    baseline: dict[str, Any] | None = None,
    device: str | None = None,
    policy: Any = None,
) -> dict[str, Any]:
    """Run one planned condition and return its result as plain data."""
    from shakedown.envs import get_env_class
    from shakedown.policies import load_policy

    condition = Condition.model_validate(planned["condition"])
    if policy is None:
        env = get_env_class(condition.env)([])
        action_dim = env.action_dim()
        env.close()
        policy = load_policy(policy_spec, action_dim=action_dim, device=device)
    runner = SuiteRunner(
        policy,
        policy_label=policy_label,
        policy_spec=policy_spec,
        out_dir=out_dir,
        options=RunOptions(videos="failures", device=device),
        baseline=baseline_from_result(baseline) if baseline else {},
    )
    result = runner.run_condition(condition, planned["source"]).to_json()
    result["policy_info"] = policy.describe()
    return result


def assemble(
    *,
    run_id: str,
    suite: str,
    policy_label: str,
    policy_spec: str,
    policy_info: dict[str, Any],
    conditions: list[dict[str, Any]],
    order: list[str],
    started_at: str,
    finished_at: str,
    duration_s: float,
    baseline: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Put separately run conditions together into one result."""
    position = {key: i for i, key in enumerate(order)}
    conditions = sorted(conditions, key=lambda c: position.get(c["key"], len(position)))
    for c in conditions:
        c.pop("policy_info", None)
    counts = Counter(c["verdict"] for c in conditions)
    episodes = sum(c["episodes"] for c in conditions)
    successes = sum(c["successes"] for c in conditions)
    regressions = sum(
        1
        for c in conditions
        for check in c["checks"]
        if check["name"] == "regression" and check["verdict"] == "FAIL"
    )
    return {
        "schema": RESULT_SCHEMA,
        "id": run_id,
        "engine_version": __version__,
        "suite": suite,
        "policy": {"label": policy_label, "spec": policy_spec, "info": policy_info},
        "git": {
            "sha": None,
            "branch": None,
            "message": None,
            "dirty": None,
            "repository": None,
            "pull_request": None,
        },
        "host": {
            "platform": platform.platform(),
            "python": platform.python_version(),
            "machine": platform.machine(),
        },
        "started_at": started_at,
        "finished_at": finished_at,
        "duration_s": round(duration_s, 2),
        "baseline": None
        if not baseline
        else {"run_id": baseline["id"], "label": baseline["policy"]["label"], "source": "hosted"},
        "verdict": worst([c["verdict"] for c in conditions]),
        "summary": {
            "conditions": len(conditions),
            "pass": counts.get("PASS", 0),
            "warn": counts.get("WARN", 0),
            "fail": counts.get("FAIL", 0),
            "skip": counts.get("SKIP", 0),
            "error": counts.get("ERROR", 0),
            "regressions": regressions,
            "episodes": episodes,
            "successes": successes,
            "success_rate": successes / episodes if episodes else 0.0,
        },
        "conditions": conditions,
    }
