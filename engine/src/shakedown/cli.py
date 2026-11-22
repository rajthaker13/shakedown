"""The `shakedown` command line interface."""

from __future__ import annotations

import json
import logging
import os
import sys
import warnings
from datetime import datetime
from pathlib import Path
from typing import Any

import typer
from rich.console import Console
from rich.progress import (
    BarColumn,
    MofNCompleteColumn,
    Progress,
    TextColumn,
    TimeElapsedColumn,
)
from rich.table import Table

from shakedown import __version__

app = typer.Typer(
    help="Regression testing for learned robot policies.",
    no_args_is_help=True,
    add_completion=False,
    pretty_exceptions_show_locals=False,
)
console = Console()
err = Console(stderr=True)

_STARTER = """\
version: 1
name: nominal
description: The task exactly as the policy was trained on it. Every other scenario is compared with this.
env: aloha/transfer_cube
episodes: 50
seed: 1000
assertions:
  success_rate: { min: 0.8 }
"""

_STARTER_SWEEP = """\
version: 1
name: camera-pan
description: The top camera is rotated about its vertical axis, as after a knock to its mount.
env: aloha/transfer_cube
episodes: 50
seed: 1000
sweep:
  name: pan
  values: [1, 2, 4]
perturbations:
  - camera_pose: { camera: top, pan_deg: "${pan}" }
assertions:
  success_rate: { min: 0.6 }
  regression: { max_drop: 0.10 }
"""


def _quiet() -> None:
    warnings.filterwarnings("ignore")
    logging.getLogger().setLevel(logging.ERROR)
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")


def _fail(message: str, code: int = 2) -> typer.Exit:
    err.print(f"[bold red]error:[/] {message}")
    return typer.Exit(code)


def _version(value: bool) -> None:
    if value:
        console.print(f"shakedown {__version__}")
        raise typer.Exit()


@app.callback()
def main(
    version: bool = typer.Option(
        False, "--version", callback=_version, is_eager=True, help="Show the version and exit."
    ),
) -> None:
    pass


@app.command()
def init(
    directory: Path = typer.Argument(Path("scenarios"), help="Where to write the starter suite."),
) -> None:
    """Write a starter scenario suite."""
    directory.mkdir(parents=True, exist_ok=True)
    written = []
    for name, body in (("nominal.yaml", _STARTER), ("camera-pan.yaml", _STARTER_SWEEP)):
        target = directory / name
        if target.exists():
            err.print(f"[yellow]skipped[/] {target} (already exists)")
            continue
        target.write_text(body)
        written.append(target)
    for target in written:
        console.print(f"[green]wrote[/] {target}")
    console.print(
        f"\nNext: [bold]shakedown run {directory} --policy lerobot:<checkpoint> --label v1[/]"
    )


@app.command()
def validate(
    suite: Path = typer.Argument(..., help="A scenario file or a directory of them."),
    build: bool = typer.Option(
        True, "--build/--no-build", help="Build each condition's scene to check it loads."
    ),
) -> None:
    """Check scenario files without running any episodes."""
    from shakedown.precheck import check_suite
    from shakedown.scenario import ScenarioError, expand, load_suite

    try:
        loaded = load_suite(suite)
    except ScenarioError as exc:
        raise _fail(str(exc)) from exc

    with console.status("checking"):
        checked = check_suite(loaded, build_scenes=build)
    bad = {problem.path for problem in checked.problems}

    table = Table(header_style="bold")
    table.add_column("Scenario")
    table.add_column("Environment")
    table.add_column("Conditions", justify="right")
    table.add_column("Episodes", justify="right")
    table.add_column("Perturbations")
    for item in loaded:
        if item.path in bad:
            continue
        conditions = expand(item.scenario)
        names = ", ".join(next(iter(p)) for p in item.scenario.perturbations) or "none"
        table.add_row(
            item.scenario.name,
            item.scenario.env,
            str(len(conditions)),
            str(item.scenario.episodes * len(conditions)),
            names,
        )
    console.print(table)
    for problem in checked.problems:
        err.print(f"[bold red]invalid:[/] {problem}")
    if not checked.ok:
        raise typer.Exit(1)
    console.print(f"[green]{len(loaded)} scenario file(s) are valid.[/]")


@app.command("list")
def list_things() -> None:
    """List the available environments and perturbations."""
    from shakedown.envs import env_ids, get_env_class
    from shakedown.perturbations import registry

    envs = Table(title="Environments", title_justify="left", header_style="bold")
    envs.add_column("Id")
    envs.add_column("Backend")
    envs.add_column("Sim perturbations")
    for env_id in env_ids():
        cls = get_env_class(env_id)
        envs.add_row(env_id, cls.backend, ", ".join(sorted(cls.supported)))
    console.print(envs)

    perts = Table(title="Perturbations", title_justify="left", header_style="bold")
    perts.add_column("Name")
    perts.add_column("Kind")
    perts.add_column("Parameters")
    perts.add_column("What it models", overflow="fold")
    for name, cls in sorted(registry().items()):
        params = ", ".join(f"{field}={info.default!r}" for field, info in cls.model_fields.items())
        perts.add_row(name, cls.kind, params, cls.summary)
    console.print(perts)
    console.print("[dim]io perturbations work with every environment.[/]")


def _progress_printer(progress: Progress) -> Any:
    tasks: dict[str, Any] = {}

    def on_event(event: str, data: dict[str, Any]) -> None:
        if event == "start":
            for c in data["conditions"]:
                tasks[c["key"]] = progress.add_task(
                    c["key"], total=c["episodes"], ok=0, start=False, visible=True
                )
        elif event == "condition_start":
            progress.start_task(tasks[data["condition"]])
        elif event == "episode":
            task = tasks[data["condition"]]
            ok = progress.tasks[task].fields["ok"] + (1 if data["success"] else 0)
            progress.update(task, advance=1, ok=ok)
        elif event == "condition_done":
            progress.stop_task(tasks[data["condition"]])

    return on_event


@app.command()
def run(
    suite: Path = typer.Argument(..., help="A scenario file or a directory of them."),
    policy: str = typer.Option(
        ...,
        "--policy",
        "-p",
        help="lerobot:<checkpoint>[?option=value], an http(s) URL, or 'random'.",
    ),
    label: str | None = typer.Option(
        None, "--label", "-l", help="Name for this policy version, e.g. v1.4 or a commit SHA."
    ),
    baseline: Path | None = typer.Option(
        None, "--baseline", "-b", help="A previous result file or run directory to compare with."
    ),
    out: Path | None = typer.Option(
        None, "--out", "-o", help="Run directory. Defaults to runs/<timestamp>-<label>."
    ),
    episodes: int | None = typer.Option(
        None, "--episodes", "-n", min=1, help="Override every scenario's episode count."
    ),
    videos: str = typer.Option("failures", "--videos", help="failures, all or none."),
    device: str | None = typer.Option(None, "--device", help="cuda, mps or cpu."),
    workers: int = typer.Option(
        1, "--workers", "-w", min=1, help="Processes to spread conditions across."
    ),
    upload: bool = typer.Option(False, "--upload", help="Send results to the Shakedown server."),
    baseline_branch: str | None = typer.Option(
        None,
        "--baseline-branch",
        help="With --upload: compare with the latest run on this branch.",
    ),
    url: str | None = typer.Option(None, "--url", envvar="SHAKEDOWN_URL"),
    api_key: str | None = typer.Option(None, "--api-key", envvar="SHAKEDOWN_API_KEY"),
    policy_token: str | None = typer.Option(
        None,
        "--policy-token",
        envvar="SHAKEDOWN_POLICY_TOKEN",
        help="Bearer token for a served policy.",
    ),
    fail_on: str = typer.Option("fail", "--fail-on", help="Exit non-zero on: fail or warn."),
    junit: Path | None = typer.Option(None, "--junit", help="Also write JUnit XML here."),
    markdown: Path | None = typer.Option(
        None, "--markdown", help="Also write a Markdown summary here."
    ),
    quiet_progress: bool = typer.Option(False, "--no-progress", help="Hide progress bars."),
) -> None:
    """Run a scenario suite against a policy."""
    _quiet()
    from shakedown.envs import UnsupportedPerturbation
    from shakedown.perturbations import PerturbationError
    from shakedown.policies import PolicyError, load_policy
    from shakedown.report import print_terminal, to_junit, to_markdown
    from shakedown.runner import (
        RunOptions,
        SuiteRunner,
        baseline_from_result,
        load_baseline,
    )
    from shakedown.scenario import ScenarioError, load_suite
    from shakedown.upload import Client, UploadError, artifact_paths, run_header

    if videos not in ("failures", "all", "none"):
        raise _fail("--videos must be failures, all or none")
    if fail_on not in ("fail", "warn"):
        raise _fail("--fail-on must be fail or warn")

    try:
        scenarios = load_suite(suite)
    except ScenarioError as exc:
        raise _fail(str(exc)) from exc
    suite_name = suite.stem if suite.is_file() else suite.resolve().name

    # Check the whole suite before running any of it.
    from shakedown.policies import parse_spec
    from shakedown.precheck import check_suite

    with console.status("checking the suite"):
        checked = check_suite(scenarios)
    if not checked.ok:
        for problem in checked.problems:
            err.print(f"[bold red]invalid:[/] {problem}")
        raise typer.Exit(2)
    action_dims = set(checked.action_dims.values())
    try:
        spec = parse_spec(policy)
    except PolicyError as exc:
        raise _fail(str(exc)) from exc
    if len(action_dims) > 1 and spec.kind == "random":
        raise _fail("a random policy needs every scenario to share one action dimension")
    if workers > 1 and spec.kind == "http":
        raise _fail("a served policy holds one episode at a time. Run with --workers 1.")

    label = label or _default_label(policy)
    out = out or Path("runs") / f"{datetime.now():%Y%m%d-%H%M%S}-{_slug(label)}"

    client: Client | None = None
    if upload:
        try:
            client = Client(api_key=api_key, url=url)
            who = client.whoami()
            console.print(f"[dim]uploading to {client.url} · project {who.get('project')}[/]")
        except UploadError as exc:
            raise _fail(str(exc)) from exc

    baselines, baseline_info = {}, None
    try:
        if baseline is not None:
            baselines, baseline_info = load_baseline(baseline)
        elif client is not None and baseline_branch:
            remote = client.baseline(suite_name, baseline_branch)
            if remote:
                baselines = baseline_from_result(remote)
                baseline_info = {
                    "run_id": remote["id"],
                    "label": remote["policy"]["label"],
                    "source": f"branch {baseline_branch}",
                }
            else:
                console.print(
                    f"[yellow]no completed run on branch '{baseline_branch}' yet; "
                    "running without a baseline[/]"
                )
    except (OSError, ValueError, KeyError, UploadError) as exc:
        raise _fail(f"could not load the baseline: {exc}") from exc

    with console.status(f"loading policy {policy}"):
        try:
            loaded = load_policy(
                policy, action_dim=next(iter(action_dims)), device=device, token=policy_token
            )
        except PolicyError as exc:
            raise _fail(str(exc)) from exc

    settings = check_suite(scenarios, build_scenes=False, policy=loaded)
    if not settings.ok:
        for problem in settings.problems:
            err.print(f"[bold red]invalid:[/] {problem}")
        loaded.close()
        raise typer.Exit(2)

    remote_run: dict[str, Any] = {}
    progress = Progress(
        TextColumn("{task.description}", justify="left"),
        BarColumn(bar_width=24),
        MofNCompleteColumn(),
        TextColumn("[green]{task.fields[ok]} ok"),
        TimeElapsedColumn(),
        console=console,
        disable=quiet_progress,
    )
    printer = _progress_printer(progress)

    def push(result) -> None:
        # Send each condition as it finishes so the dashboard updates live.
        if client is None:
            return
        try:
            payload = result.to_json()
            client.add_condition(remote_run["run_id"], payload)
            client.upload_artifacts(remote_run["run_id"], out, artifact_paths(payload))
        except UploadError as exc:
            err.print(f"[yellow]upload of {result.condition.key} failed:[/] {exc}")

    runner = SuiteRunner(
        loaded,
        policy_label=label,
        policy_spec=policy,
        out_dir=out,
        options=RunOptions(
            videos=videos,  # type: ignore[arg-type]
            episodes=episodes,
            workers=workers,
            device=device,
        ),
        baseline=baselines,
        baseline_info=baseline_info,
        progress=printer,
        on_condition=push,
    )

    try:
        if client is not None:
            import platform
            import uuid

            from shakedown import __version__ as engine_version
            from shakedown.runner import RESULT_SCHEMA, _now, git_info
            from shakedown.scenario import expand

            planned = [
                {
                    "key": c.key,
                    "label": c.label,
                    "scenario": c.scenario,
                    "episodes": episodes or c.episodes,
                }
                for item in scenarios
                for c in expand(item.scenario)
            ]
            header = run_header(
                {
                    "id": str(uuid.uuid4()),
                    "schema": RESULT_SCHEMA,
                    "engine_version": engine_version,
                    "suite": suite_name,
                    "policy": {"label": label, "spec": policy, "info": loaded.describe()},
                    "git": git_info(),
                    "host": {
                        "platform": platform.platform(),
                        "python": platform.python_version(),
                        "machine": platform.machine(),
                    },
                    "started_at": _now(),
                    "baseline": baseline_info,
                },
                planned,
            )
            remote_run.update(client.create_run(header))
        with progress:
            result = runner.run(suite_name, scenarios)
    except (
        UnsupportedPerturbation,
        PerturbationError,
        PolicyError,
        ValueError,
        NotImplementedError,
    ) as exc:
        raise _fail(str(exc)) from exc
    except UploadError as exc:
        raise _fail(str(exc)) from exc
    finally:
        loaded.close()

    data = result.to_json()
    run_url = None
    if client is not None and remote_run:
        # The server assigned the run id when the run was created.
        data["id"] = remote_run["run_id"]
        (out / "result.json").write_text(json.dumps(data, indent=2))
        try:
            done = client.complete_run(
                remote_run["run_id"],
                {
                    "finished_at": data["finished_at"],
                    "duration_s": data["duration_s"],
                    "verdict": data["verdict"],
                    "summary": data["summary"],
                },
            )
            run_url = done.get("url") or remote_run.get("url")
        except UploadError as exc:
            err.print(f"[yellow]could not mark the run complete:[/] {exc}")
        finally:
            client.close()

    console.print()
    print_terminal(data, console)
    console.print(f"[dim]results: {out / 'result.json'}[/]")
    if run_url:
        console.print(f"[dim]dashboard:[/] {run_url}")
    if junit:
        junit.parent.mkdir(parents=True, exist_ok=True)
        junit.write_text(to_junit(data))
    if markdown:
        markdown.parent.mkdir(parents=True, exist_ok=True)
        markdown.write_text(to_markdown(data, run_url))
    summary_file = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_file:
        with open(summary_file, "a") as f:
            f.write(to_markdown(data, run_url))

    raise typer.Exit(_exit_code(data["verdict"], fail_on))


def _exit_code(verdict: str, fail_on: str) -> int:
    if verdict == "ERROR":
        return 2
    if verdict == "FAIL":
        return 1
    if verdict == "WARN" and fail_on == "warn":
        return 1
    return 0


def _slug(text: str) -> str:
    out = "".join(ch if ch.isalnum() or ch in "._-" else "-" for ch in text).strip("-")
    return out[:60] or "run"


def _default_label(policy: str) -> str:
    from shakedown.policies import parse_spec

    spec = parse_spec(policy)
    if spec.kind == "lerobot":
        name = Path(spec.target).name
        if spec.options:
            name += "+" + "+".join(f"{k}={v}" for k, v in sorted(spec.options.items()))
        return name
    return spec.kind


@app.command()
def report(
    result: Path = typer.Argument(..., help="A result file or run directory."),
    format: str = typer.Option(
        "terminal", "--format", "-f", help="terminal, markdown, junit, json."
    ),
) -> None:
    """Print a saved result in another format."""
    from shakedown.report import print_terminal, to_junit, to_markdown

    path = result / "result.json" if result.is_dir() else result
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError) as exc:
        raise _fail(f"could not read {path}: {exc}") from exc
    if format == "terminal":
        print_terminal(data, console)
    elif format == "markdown":
        sys.stdout.write(to_markdown(data))
    elif format == "junit":
        sys.stdout.write(to_junit(data))
    elif format == "json":
        sys.stdout.write(json.dumps(data, indent=2) + "\n")
    else:
        raise _fail("--format must be terminal, markdown, junit or json")


@app.command()
def compare(
    base: Path = typer.Argument(..., help="Baseline result file or run directory."),
    head: Path = typer.Argument(..., help="Candidate result file or run directory."),
    max_drop: float = typer.Option(0.05, "--max-drop", min=0, max=1),
    confidence: float = typer.Option(0.95, "--confidence"),
    fail_on: str = typer.Option("fail", "--fail-on"),
) -> None:
    """Compare two saved results condition by condition."""
    from shakedown.runner import baseline_from_result
    from shakedown.scenario import RegressionAssertion
    from shakedown.verdict import check_regression, worst
    from shakedown.verdict import compare as compare_outcomes

    def read(path: Path) -> dict[str, Any]:
        path = path / "result.json" if path.is_dir() else path
        try:
            return json.loads(path.read_text())
        except (OSError, ValueError) as exc:
            raise _fail(f"could not read {path}: {exc}") from exc

    if confidence not in (0.8, 0.9, 0.95, 0.99):
        raise _fail("--confidence must be one of 0.8, 0.9, 0.95, 0.99")
    base_data, head_data = read(base), read(head)
    baselines = baseline_from_result(base_data)
    rule = RegressionAssertion(max_drop=max_drop, confidence=confidence)

    table = Table(
        title=f"{base_data['policy']['label']}  →  {head_data['policy']['label']}",
        title_justify="left",
        header_style="bold",
    )
    table.add_column("Condition")
    table.add_column("Base", justify="right")
    table.add_column("Head", justify="right")
    table.add_column("Δ pts", justify="right")
    table.add_column("Broke", justify="right")
    table.add_column("Fixed", justify="right")
    table.add_column("p", justify="right")
    table.add_column("Result")
    verdicts = []
    rows = []
    for c in head_data["conditions"]:
        b = baselines.get(c["key"])
        if b is None:
            rows.append(
                (
                    0.0,
                    [
                        c["label"],
                        "–",
                        f"{c['success_rate']:.0%}",
                        "–",
                        "–",
                        "–",
                        "–",
                        "[dim]not in baseline[/]",
                    ],
                )
            )
            continue
        outcomes = {int(s): bool(ok) for s, ok in c["outcomes"].items()}
        cmp, paired = compare_outcomes(outcomes, b, c["fingerprint"])
        b_rate = sum(b.outcomes.values()) / len(b.outcomes)
        check = check_regression(cmp, paired, b.label, b_rate, rule)
        verdicts.append(check.verdict)
        color = {"PASS": "green", "WARN": "yellow", "FAIL": "bold red"}[check.verdict]
        delta = (cmp.candidate_rate - b_rate) * 100
        rows.append(
            (
                delta,
                [
                    c["label"],
                    f"{b_rate:.0%}",
                    f"{cmp.candidate_rate:.0%}",
                    f"{delta:+.0f}",
                    str(cmp.regressed) if paired else "–",
                    str(cmp.improved) if paired else "–",
                    f"{cmp.p_value:.3f}",
                    f"[{color}]{check.verdict}[/]" + ("" if paired else " [dim](unpaired)[/]"),
                ],
            )
        )
    for _, row in sorted(rows, key=lambda r: r[0]):
        table.add_row(*row)
    console.print(table)
    raise typer.Exit(_exit_code(worst(verdicts), fail_on))


@app.command()
def upload(
    result: Path = typer.Argument(..., help="A run directory produced by `shakedown run`."),
    url: str | None = typer.Option(None, "--url", envvar="SHAKEDOWN_URL"),
    api_key: str | None = typer.Option(None, "--api-key", envvar="SHAKEDOWN_API_KEY"),
) -> None:
    """Upload a finished run to the Shakedown server."""
    from shakedown.upload import Client, UploadError, upload_result

    run_dir = result if result.is_dir() else result.parent
    try:
        data = json.loads((run_dir / "result.json").read_text())
    except (OSError, ValueError) as exc:
        raise _fail(f"could not read {run_dir / 'result.json'}: {exc}") from exc
    try:
        client = Client(api_key=api_key, url=url)
        with console.status("uploading"):
            out = upload_result(client, data, run_dir)
        client.close()
    except UploadError as exc:
        raise _fail(str(exc)) from exc
    console.print(f"[green]uploaded[/] {out['url'] or out['run_id']}")


@app.command("serve-policy")
def serve_policy(
    policy: str = typer.Option(..., "--policy", "-p", help="lerobot:<checkpoint> or 'random'."),
    action_dim: int | None = typer.Option(
        None,
        "--action-dim",
        help="Required for the random policy. Read from the checkpoint otherwise.",
    ),
    host: str = typer.Option("127.0.0.1", "--host"),
    port: int = typer.Option(8000, "--port"),
    device: str | None = typer.Option(None, "--device"),
    token: str | None = typer.Option(
        None, "--token", envvar="SHAKEDOWN_POLICY_TOKEN", help="Require this bearer token."
    ),
) -> None:
    """Serve a policy over HTTP, so it can be tested without sharing its weights."""
    _quiet()
    from shakedown.policies import PolicyError, load_policy
    from shakedown.policies.server import create_app

    try:
        import uvicorn
    except ImportError as exc:
        raise _fail(
            "the policy server is not installed. From the repository, run: "
            "pip install -e 'engine[server]'"
        ) from exc
    from shakedown.policies import parse_spec

    if parse_spec(policy).kind == "random" and action_dim is None:
        raise _fail("--action-dim is required when serving the random policy")
    try:
        loaded = load_policy(policy, action_dim=action_dim or 0, device=device)
    except PolicyError as exc:
        raise _fail(str(exc)) from exc
    if action_dim is None:
        action_dim = loaded.describe().get("action_dim")
    if host not in ("127.0.0.1", "localhost") and not token:
        err.print("[yellow]warning:[/] serving on a public interface without --token")
    console.print(f"serving {policy} on http://{host}:{port}")
    uvicorn.run(
        create_app(loaded, _default_label(policy), action_dim, token),
        host=host,
        port=port,
        log_level="warning",
    )


real_app = typer.Typer(
    help="Validate simulated results against a real robot.", no_args_is_help=True
)
scan_app = typer.Typer(
    help="Turn a scan of a real workcell into a test scene.", no_args_is_help=True
)
app.add_typer(real_app, name="real")
app.add_typer(scan_app, name="scan")


def _register_extensions() -> None:
    from shakedown import field_cli
    from shakedown.real import cli as real_cli
    from shakedown.scan import cli as scan_cli

    real_cli.register(real_app)
    scan_cli.register(scan_app)
    field_cli.register(app)
    field_cli.register_tune(app)


_register_extensions()


if __name__ == "__main__":
    app()
