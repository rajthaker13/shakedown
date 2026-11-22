"""Run a scenario suite against a policy and produce a result."""

from __future__ import annotations

import json
import os
import platform
import subprocess
import time
import traceback
import uuid
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import numpy as np

from shakedown import __version__
from shakedown.divergence import first_divergence
from shakedown.envs import EnvAdapter, get_env_class
from shakedown.perturbations import IoPerturbation, SimPerturbation, build_all
from shakedown.policies.base import Policy
from shakedown.scenario import Condition, LoadedScenario, expand
from shakedown.stats import PairedComparison, wilson_interval
from shakedown.types import EpisodeRecord
from shakedown.verdict import Baseline, Check, Verdict, evaluate, worst
from shakedown.video import compose, write_video

RESULT_SCHEMA = 1
VideoMode = Literal["failures", "all", "none"]

#: Record a video frame every this many control steps.
FRAME_STRIDE = 2


@dataclass
class RunOptions:
    videos: VideoMode = "failures"
    #: Upper bound on failure videos kept per condition.
    max_failure_videos: int = 8
    #: Successful episodes recorded per condition, for reference.
    success_videos: int = 1
    #: Re-run failed seeds without perturbations to locate the first divergent step.
    divergence: bool = True
    #: Override every scenario's episode count, e.g. for a quick smoke run.
    episodes: int | None = None
    #: Processes to spread conditions across. Each loads its own copy of the policy.
    workers: int = 1
    device: str | None = None


@dataclass
class ConditionResult:
    condition: Condition
    backend: str
    fingerprint: str
    perturbation_summary: list[str]
    episodes: list[EpisodeRecord]
    checks: list[Check]
    verdict: Verdict
    comparison: PairedComparison | None
    paired: bool
    baseline_label: str | None
    duration_s: float
    scenario_source: str
    error: str | None = None

    @property
    def valid(self) -> list[EpisodeRecord]:
        """Episodes that ran. An episode stopped by a fault is not a policy failure."""
        return [e for e in self.episodes if e.error is None]

    @property
    def n(self) -> int:
        return len(self.valid)

    @property
    def successes(self) -> int:
        return sum(1 for e in self.valid if e.success)

    @property
    def success_rate(self) -> float:
        return self.successes / self.n if self.n else 0.0

    def to_json(self) -> dict[str, Any]:
        low, high = wilson_interval(self.successes, self.n) if self.n else (0.0, 1.0)
        ok_steps = [e.steps for e in self.valid if e.success]
        contacts: Counter[str] = Counter()
        for e in self.valid:
            contacts.update(e.contacts.keys())
        labels = Counter(e.failure_label for e in self.valid if e.failure_label)
        c = self.condition
        return {
            "key": c.key,
            "scenario": c.scenario,
            "label": c.label,
            "description": c.description,
            "env": c.env,
            "backend": self.backend,
            "sweep_name": c.sweep_name,
            "sweep_value": c.sweep_value,
            "tags": c.tags,
            "perturbations": c.perturbations,
            "perturbation_summary": self.perturbation_summary,
            "fingerprint": self.fingerprint,
            "episodes": self.n,
            "successes": self.successes,
            "success_rate": self.success_rate,
            "ci_low": low,
            "ci_high": high,
            "mean_steps_success": (sum(ok_steps) / len(ok_steps)) if ok_steps else None,
            "contacts": dict(contacts),
            "failure_labels": dict(labels),
            "verdict": self.verdict,
            "checks": [ch.to_json() for ch in self.checks],
            "comparison": None
            if self.comparison is None
            else {
                "baseline": self.baseline_label,
                "paired": self.paired,
                "baseline_rate": self.comparison.baseline_rate,
                "candidate_rate": self.comparison.candidate_rate,
                "delta": self.comparison.delta,
                "p_value": self.comparison.p_value,
                "regressed_seeds": self.comparison.regressed,
                "improved_seeds": self.comparison.improved,
            },
            "errors": len(self.episodes) - self.n,
            "outcomes": {str(e.seed): e.success for e in self.valid},
            "duration_s": round(self.duration_s, 2),
            "scenario_source": self.scenario_source,
            "error": self.error,
            "episodes_detail": [
                {
                    "seed": e.seed,
                    "success": e.success,
                    "steps": e.steps,
                    "max_reward": e.max_reward,
                    "duration_s": round(e.duration_s, 3),
                    "failure_label": e.failure_label,
                    "first_divergence_step": e.first_divergence_step,
                    "nominal_success": e.nominal_success,
                    "contacts": e.contacts,
                    "video": e.video_path,
                    "trace": None if e.error else f"episodes/{_safe(c.key)}/{e.seed}.json",
                    "error": e.error,
                }
                for e in self.episodes
            ],
        }


@dataclass
class RunResult:
    id: str
    suite: str
    policy_label: str
    policy_spec: str
    policy_info: dict[str, Any]
    started_at: str
    finished_at: str
    duration_s: float
    git: dict[str, Any]
    baseline: dict[str, Any] | None
    conditions: list[ConditionResult] = field(default_factory=list)

    @property
    def verdict(self) -> Verdict:
        return worst([c.verdict for c in self.conditions])

    def to_json(self) -> dict[str, Any]:
        counts = Counter(c.verdict for c in self.conditions)
        episodes = sum(c.n for c in self.conditions)
        successes = sum(c.successes for c in self.conditions)
        regressions = sum(
            1
            for c in self.conditions
            for ch in c.checks
            if ch.name == "regression" and ch.verdict == "FAIL"
        )
        return {
            "schema": RESULT_SCHEMA,
            "id": self.id,
            "engine_version": __version__,
            "suite": self.suite,
            "policy": {
                "label": self.policy_label,
                "spec": self.policy_spec,
                "info": self.policy_info,
            },
            "git": self.git,
            "host": {
                "platform": platform.platform(),
                "python": platform.python_version(),
                "machine": platform.machine(),
            },
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "duration_s": round(self.duration_s, 2),
            "baseline": self.baseline,
            "verdict": self.verdict,
            "summary": {
                "conditions": len(self.conditions),
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
            "conditions": [c.to_json() for c in self.conditions],
        }


def _safe(name: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in name)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def git_info(cwd: str | Path | None = None) -> dict[str, Any]:
    """Commit metadata, preferring CI environment variables over the local checkout."""

    def run(*args: str) -> str | None:
        try:
            out = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, timeout=5)
            return out.stdout.strip() or None if out.returncode == 0 else None
        except (OSError, subprocess.SubprocessError):
            return None

    sha = os.environ.get("GITHUB_SHA") or run("rev-parse", "HEAD")
    branch = (
        os.environ.get("GITHUB_HEAD_REF")
        or os.environ.get("GITHUB_REF_NAME")
        or run("rev-parse", "--abbrev-ref", "HEAD")
    )
    status = run("status", "--porcelain")
    return {
        "sha": sha,
        "branch": branch,
        "message": run("log", "-1", "--format=%s"),
        "dirty": bool(status) if sha else None,
        "repository": os.environ.get("GITHUB_REPOSITORY"),
        "pull_request": _pr_number(),
    }


def _pr_number() -> int | None:
    ref = os.environ.get("GITHUB_REF", "")
    parts = ref.split("/")
    if len(parts) >= 3 and parts[1] == "pull" and parts[2].isdigit():
        return int(parts[2])
    return None


@dataclass
class _Trace:
    record: EpisodeRecord
    actions: np.ndarray
    frames: list[np.ndarray]


def run_episode(
    env: EnvAdapter,
    policy: Policy,
    io_perturbations: list[IoPerturbation],
    seed: int,
    max_steps: int,
    record_frames: bool,
) -> _Trace:
    started = time.perf_counter()
    rngs = [np.random.default_rng([seed, 104729, i]) for i in range(len(io_perturbations))]
    for p, rng in zip(io_perturbations, rngs):
        p.begin_episode(rng)

    obs = env.reset(seed)
    policy.reset(seed)

    signals: dict[str, list[float]] = {}
    contacts: dict[str, int] = {}
    actions: list[np.ndarray] = []
    frames: list[np.ndarray] = []
    max_reward = 0.0
    success = False
    previous: np.ndarray | None = None
    views = env.initial_views() if hasattr(env, "initial_views") else {}
    step = 0

    for step in range(max_steps):
        seen = obs
        for p, rng in zip(io_perturbations, rngs):
            seen = p.transform_observation(seen, rng, step)

        if record_frames and step % FRAME_STRIDE == 0:
            policy_view = next(iter(seen.images.values()))
            frames.append(compose(policy_view, views.get("external")))

        action = np.asarray(policy.act(seen), dtype=np.float32)
        actions.append(action.copy())
        sent = action
        for p, rng in zip(io_perturbations, rngs):
            sent = p.transform_action(sent, rng, step)

        obs, result = env.step(sent)
        views = result.views

        for key, value in result.signals.items():
            signals.setdefault(key, []).append(float(value))
        delta = 0.0 if previous is None else float(np.linalg.norm(action - previous))
        signals.setdefault("action_change", []).append(delta)
        previous = action
        for group in result.contacts:
            contacts.setdefault(group, step)
        max_reward = max(max_reward, result.reward)
        if result.terminated:
            success = result.success
            break

    steps = len(actions)
    record = EpisodeRecord(
        seed=seed,
        success=success,
        steps=steps,
        max_reward=max_reward,
        duration_s=time.perf_counter() - started,
        signals=signals,
        contacts=contacts,
    )
    if not success:
        record.failure_label = env.failure_label(max_reward, signals)
    return _Trace(record=record, actions=np.asarray(actions), frames=frames)


Progress = Callable[[str, dict[str, Any]], None]


class SuiteRunner:
    def __init__(
        self,
        policy: Policy,
        *,
        policy_label: str,
        policy_spec: str,
        out_dir: str | Path,
        options: RunOptions | None = None,
        baseline: dict[str, Baseline] | None = None,
        baseline_info: dict[str, Any] | None = None,
        progress: Progress | None = None,
        on_condition: Callable[[ConditionResult], None] | None = None,
    ):
        self.on_condition = on_condition or (lambda result: None)
        self.policy = policy
        self.policy_label = policy_label
        self.policy_spec = policy_spec
        self.out_dir = Path(out_dir)
        self.options = options or RunOptions()
        self.baseline = baseline or {}
        self.baseline_info = baseline_info
        self.progress = progress or (lambda event, data: None)
        #: Nominal action traces keyed by (env id, max steps, seed).
        self._nominal: dict[tuple[str, int, int], tuple[np.ndarray, bool]] = {}

    # -- nominal reference ----------------------------------------------------------

    def _nominal_path(self, env_id: str, max_steps: int, seed: int) -> Path:
        return self.out_dir / "nominal" / f"{_safe(env_id)}-{max_steps}-{seed}.npz"

    def _store_nominal(
        self, env_id: str, max_steps: int, seed: int, actions: np.ndarray, success: bool
    ) -> None:
        self._nominal[(env_id, max_steps, seed)] = (actions, success)
        # Worker processes share nominal traces through the run directory.
        path = self._nominal_path(env_id, max_steps, seed)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(f".{os.getpid()}.tmp.npz")
        np.savez_compressed(tmp, actions=actions, success=np.asarray(success))
        os.replace(tmp, path)

    def _nominal_trace(self, env_id: str, max_steps: int, seed: int) -> tuple[np.ndarray, bool]:
        key = (env_id, max_steps, seed)
        if key in self._nominal:
            return self._nominal[key]
        path = self._nominal_path(env_id, max_steps, seed)
        if path.exists():
            with np.load(path) as data:
                self._nominal[key] = (data["actions"], bool(data["success"]))
            return self._nominal[key]
        env = get_env_class(env_id)([])
        try:
            trace = run_episode(env, self.policy, [], seed, max_steps, record_frames=False)
        finally:
            env.close()
        self._store_nominal(env_id, max_steps, seed, trace.actions, trace.record.success)
        return self._nominal[key]

    # -- one condition --------------------------------------------------------------

    def run_condition(self, condition: Condition, source: str) -> ConditionResult:
        started = time.perf_counter()
        opts = self.options
        if opts.episodes is not None:
            condition = condition.model_copy(update={"episodes": opts.episodes})
        env_cls = get_env_class(condition.env)
        perturbations = build_all(condition.perturbations)
        sim = [p for p in perturbations if isinstance(p, SimPerturbation)]
        io = [p for p in perturbations if isinstance(p, IoPerturbation)]
        max_steps = condition.max_steps or env_cls.default_max_steps
        is_nominal = not perturbations
        episode_dir = self.out_dir / "episodes" / _safe(condition.key)
        episode_dir.mkdir(parents=True, exist_ok=True)

        delay = sum(getattr(p, "steps", 0) for p in io if p.name == "action_latency")

        records: list[EpisodeRecord] = []
        failure_videos = success_videos = 0
        error: str | None = None
        try:
            # A deployed policy knows its own latency; tell it what this condition imposes.
            self.policy.configure(action_delay_steps=delay)
            env = env_cls(sim)
        except Exception as exc:
            # A scene that cannot be built, e.g. a perturbation naming a camera that
            # does not exist. Report it against the condition and carry on.
            return ConditionResult(
                condition=condition,
                backend=env_cls.backend,
                fingerprint=condition.fingerprint(),
                perturbation_summary=[p.describe() for p in perturbations],
                episodes=[],
                checks=[],
                verdict="ERROR",
                comparison=None,
                paired=False,
                baseline_label=None,
                duration_s=time.perf_counter() - started,
                scenario_source=source,
                error=f"could not build the scene: {exc}",
            )
        try:
            for index, seed in enumerate(condition.seeds()):
                try:
                    trace = run_episode(
                        env, self.policy, io, seed, max_steps, record_frames=opts.videos != "none"
                    )
                except Exception as exc:  # an infrastructure fault, not a policy failure
                    error = f"seed {seed}: {type(exc).__name__}: {exc}"
                    records.append(
                        EpisodeRecord(
                            seed=seed,
                            success=False,
                            steps=0,
                            max_reward=0.0,
                            duration_s=0.0,
                            error=f"{error}\n{traceback.format_exc(limit=5)}",
                        )
                    )
                    self.progress(
                        "episode",
                        {
                            "condition": condition.key,
                            "index": index + 1,
                            "total": condition.episodes,
                            "success": False,
                            "error": True,
                        },
                    )
                    continue
                record = trace.record

                if is_nominal:
                    self._store_nominal(
                        condition.env, max_steps, seed, trace.actions, record.success
                    )
                elif opts.divergence and not record.success:
                    # The reference is the policy with no delay to compensate for.
                    self.policy.configure(action_delay_steps=0)
                    try:
                        nominal_actions, nominal_ok = self._nominal_trace(
                            condition.env, max_steps, seed
                        )
                    finally:
                        self.policy.configure(action_delay_steps=delay)
                    step, div = first_divergence(nominal_actions, trace.actions)
                    record.first_divergence_step = step
                    record.signals["action_divergence"] = [float(x) for x in div]
                    record.nominal_success = nominal_ok

                keep = opts.videos == "all"
                if opts.videos == "failures":
                    if not record.success and failure_videos < opts.max_failure_videos:
                        keep, failure_videos = True, failure_videos + 1
                    elif record.success and success_videos < opts.success_videos:
                        keep, success_videos = True, success_videos + 1
                if keep and trace.frames:
                    rel = f"episodes/{_safe(condition.key)}/{seed}.mp4"
                    write_video(trace.frames, self.out_dir / rel, max(1, env.fps // FRAME_STRIDE))
                    record.video_path = rel

                payload = record.to_json()
                payload["frame_stride"] = FRAME_STRIDE
                payload["fps"] = env.fps
                (episode_dir / f"{seed}.json").write_text(json.dumps(payload))
                records.append(record)
                self.progress(
                    "episode",
                    {
                        "condition": condition.key,
                        "index": index + 1,
                        "total": condition.episodes,
                        "success": record.success,
                        "error": False,
                    },
                )
        finally:
            env.close()

        fingerprint = condition.fingerprint()
        valid = [r for r in records if r.error is None]
        contact_episodes: Counter[str] = Counter()
        for r in valid:
            contact_episodes.update(r.contacts.keys())
        baseline = self.baseline.get(condition.key)
        checks, comparison, paired = evaluate(
            assertions=condition.assertions,
            outcomes={r.seed: r.success for r in valid},
            success_steps=[r.steps for r in valid if r.success],
            contact_episodes=dict(contact_episodes),
            fingerprint=fingerprint,
            baseline=baseline,
        )
        verdict: Verdict = "ERROR" if error else worst([c.verdict for c in checks])
        return ConditionResult(
            condition=condition,
            backend=env_cls.backend,
            fingerprint=fingerprint,
            perturbation_summary=[p.describe() for p in perturbations],
            episodes=records,
            checks=checks,
            verdict=verdict,
            comparison=comparison,
            paired=paired,
            baseline_label=baseline.label if baseline else None,
            duration_s=time.perf_counter() - started,
            scenario_source=source,
            error=error,
        )

    # -- the whole suite ------------------------------------------------------------

    def run(self, suite_name: str, scenarios: list[LoadedScenario]) -> RunResult:
        self.out_dir.mkdir(parents=True, exist_ok=True)
        started_at, started = _now(), time.perf_counter()
        pairs = [(c, item.source) for item in scenarios for c in expand(item.scenario)]
        # Nominal conditions run first so their traces are available for divergence.
        pairs.sort(key=lambda pair: bool(pair[0].perturbations))
        self.progress(
            "start",
            {
                "conditions": [
                    {"key": c.key, "episodes": self.options.episodes or c.episodes}
                    for c, _ in pairs
                ]
            },
        )

        results: list[ConditionResult] = []

        def finish(result: ConditionResult) -> None:
            results.append(result)
            self.on_condition(result)
            self.progress(
                "condition_done",
                {
                    "condition": result.condition.key,
                    "verdict": result.verdict,
                    "success_rate": result.success_rate,
                },
            )

        workers = max(1, self.options.workers)
        if workers > 1 and self.policy_spec.startswith(("http://", "https://")):
            raise ValueError("a served policy holds one episode at a time. Run with --workers 1.")
        nominal = [pair for pair in pairs if not pair[0].perturbations]
        rest = [pair for pair in pairs if pair[0].perturbations]
        serial = pairs if workers == 1 else nominal
        for condition, source in serial:
            self.progress("condition_start", {"condition": condition.key})
            finish(self.run_condition(condition, source))
        if workers > 1 and rest:
            self._run_parallel(rest, workers, finish)

        order: dict[str, int] = {}
        for item in scenarios:
            for c in expand(item.scenario):
                order[c.key] = len(order)
        results.sort(key=lambda r: order.get(r.condition.key, 0))

        run = RunResult(
            id=str(uuid.uuid4()),
            suite=suite_name,
            policy_label=self.policy_label,
            policy_spec=self.policy_spec,
            policy_info=self.policy.describe(),
            started_at=started_at,
            finished_at=_now(),
            duration_s=time.perf_counter() - started,
            git=git_info(),
            baseline=self.baseline_info,
            conditions=results,
        )
        (self.out_dir / "result.json").write_text(json.dumps(run.to_json(), indent=2))
        return run


# -- parallel execution ---------------------------------------------------------------

_worker: SuiteRunner | None = None


def _worker_init(
    spec: str,
    label: str,
    out_dir: str,
    options: RunOptions,
    baseline: dict[str, Baseline],
    action_dim: int,
    queue: Any,
) -> None:
    import logging
    import warnings

    from shakedown.policies import load_policy

    warnings.filterwarnings("ignore")
    logging.getLogger().setLevel(logging.ERROR)
    global _worker
    policy = load_policy(spec, action_dim=action_dim, device=options.device)
    _worker = SuiteRunner(
        policy,
        policy_label=label,
        policy_spec=spec,
        out_dir=out_dir,
        options=options,
        baseline=baseline,
        progress=lambda event, data: queue.put((event, data)),
    )


def _worker_run(condition: Condition, source: str) -> ConditionResult:
    assert _worker is not None
    _worker.progress("condition_start", {"condition": condition.key})
    return _worker.run_condition(condition, source)


def _run_parallel(
    self: SuiteRunner,
    pairs: list[tuple[Condition, str]],
    workers: int,
    finish: Callable[[ConditionResult], None],
) -> None:
    import multiprocessing as mp
    import queue as queue_mod
    from concurrent.futures import FIRST_COMPLETED, ProcessPoolExecutor, wait

    ctx = mp.get_context("spawn")
    manager = ctx.Manager()
    events = manager.Queue()
    action_dim = get_env_class(pairs[0][0].env)([]).action_dim()

    def drain() -> None:
        while True:
            try:
                event, data = events.get_nowait()
            except queue_mod.Empty:
                return
            self.progress(event, data)

    with ProcessPoolExecutor(
        max_workers=min(workers, len(pairs)),
        mp_context=ctx,
        initializer=_worker_init,
        initargs=(
            self.policy_spec,
            self.policy_label,
            str(self.out_dir),
            self.options,
            self.baseline,
            action_dim,
            events,
        ),
    ) as pool:
        pending = {pool.submit(_worker_run, c, source) for c, source in pairs}
        while pending:
            done, pending = wait(pending, timeout=0.5, return_when=FIRST_COMPLETED)
            drain()
            for future in done:
                finish(future.result())
        drain()
    manager.shutdown()


SuiteRunner._run_parallel = _run_parallel  # type: ignore[attr-defined]


def load_baseline(path: str | Path) -> tuple[dict[str, Baseline], dict[str, Any]]:
    """Read a previous result file as the baseline for a new run."""
    path = Path(path)
    if path.is_dir():
        path = path / "result.json"
    data = json.loads(path.read_text())
    if data.get("schema") != RESULT_SCHEMA:
        raise ValueError(f"{path}: unsupported result schema {data.get('schema')!r}")
    return baseline_from_result(data), {
        "run_id": data["id"],
        "label": data["policy"]["label"],
        "source": str(path),
    }


def baseline_from_result(data: dict[str, Any]) -> dict[str, Baseline]:
    label = data["policy"]["label"]
    out: dict[str, Baseline] = {}
    for c in data["conditions"]:
        out[c["key"]] = Baseline(
            label=label,
            fingerprint=c["fingerprint"],
            outcomes={int(seed): bool(ok) for seed, ok in c["outcomes"].items()},
        )
    return out
