"""`shakedown field` and `shakedown release`: the robot's side of the pipeline."""

from __future__ import annotations

import json
from pathlib import Path

import typer
from rich.console import Console

console = Console()
err = Console(stderr=True)


def _fail(message: str) -> typer.Exit:
    err.print(f"[bold red]error:[/] {message}")
    return typer.Exit(2)


def _client(url: str | None, api_key: str | None):
    from shakedown.field import FieldClient, FieldError

    try:
        return FieldClient(url=url, api_key=api_key)
    except FieldError as exc:
        raise _fail(str(exc)) from exc


def register(app: typer.Typer) -> None:
    field = typer.Typer(help="Report what happens on real robots.", no_args_is_help=True)
    app.add_typer(field, name="field")

    @app.command()
    def release(
        channel: str = typer.Option("fleet", "--channel", "-c", help="fleet or canary."),
        as_json: bool = typer.Option(False, "--json"),
        url: str | None = typer.Option(None, "--url", envvar="SHAKEDOWN_URL"),
        api_key: str | None = typer.Option(None, "--api-key", envvar="SHAKEDOWN_API_KEY"),
    ) -> None:
        """Print the release that robots on a channel should run."""
        from shakedown.field import FieldError

        client = _client(url, api_key)
        try:
            current = client.release(channel)
        except FieldError as exc:
            raise _fail(str(exc)) from exc
        if current is None:
            if as_json:
                console.print_json("null")
            else:
                console.print(f"No release is on the {channel} channel.")
            raise typer.Exit(1)
        if as_json:
            console.print_json(json.dumps(current.__dict__))
        else:
            console.print(f"#{current.number} {current.policy_label} ({current.stage})")
            console.print(f"  policy   {current.policy_spec}")
            console.print(f"  settings {current.runtime_config or 'as published'}")

    @field.command()
    def report(
        policy_label: str = typer.Option(..., "--policy-label", "-l"),
        success: bool = typer.Option(..., "--success/--failure"),
        release_number: int | None = typer.Option(None, "--release", help="Release number."),
        robot: str = typer.Option("", "--robot"),
        site: str = typer.Option("", "--site"),
        intervention: bool = typer.Option(False, "--intervention", help="A person stepped in."),
        reason: str = typer.Option("", "--reason", help="Why a person stepped in."),
        note: str = typer.Option("", "--note"),
        action_delay_ms: float | None = typer.Option(None, "--action-delay-ms"),
        url: str | None = typer.Option(None, "--url", envvar="SHAKEDOWN_URL"),
        api_key: str | None = typer.Option(None, "--api-key", envvar="SHAKEDOWN_API_KEY"),
    ) -> None:
        """Report one attempt by hand, for robots whose loop you cannot change."""
        import uuid

        client = _client(url, api_key)
        measured = {} if action_delay_ms is None else {"action_delay_ms": action_delay_ms}
        sent = client.report(
            {
                "id": uuid.uuid4().hex,
                "policy_label": policy_label,
                "release": release_number,
                "robot": robot,
                "site": site,
                "success": success,
                "intervention": intervention,
                "intervention_reason": reason,
                "note": note,
                "measured": measured,
            }
        )
        if client.rejected:
            raise _fail(f"the server refused the report: {client.rejected[0][1]}")
        if not sent or client.pending:
            raise _fail("the report could not be sent")
        console.print("[green]reported[/]")

    @field.command()
    def simulate(
        policy: str = typer.Option(..., "--policy", "-p", help="The policy the robots run."),
        channel: str = typer.Option("canary", "--channel", "-c", help="Release channel to run."),
        env: str = typer.Option("aloha/transfer_cube", "--env"),
        robots: Path = typer.Option(
            ..., "--robots", help="YAML file describing each stand-in robot and its conditions."
        ),
        episodes: int = typer.Option(20, "--episodes", "-n", min=1, help="Attempts per robot."),
        seed: int = typer.Option(5000, "--seed"),
        device: str | None = typer.Option(None, "--device"),
        url: str | None = typer.Option(None, "--url", envvar="SHAKEDOWN_URL"),
        api_key: str | None = typer.Option(None, "--api-key", envvar="SHAKEDOWN_API_KEY"),
    ) -> None:
        """Stand in for a fleet: run the policy in simulation and report as robots would.

        For trying the pipeline without hardware. Every report is marked as
        simulated, and the dashboard says so.
        """
        import warnings

        import numpy as np
        import yaml

        from shakedown.envs import get_env_class
        from shakedown.field import FieldError
        from shakedown.perturbations import IoPerturbation, SimPerturbation, build_all
        from shakedown.policies import PolicyError, load_policy

        warnings.filterwarnings("ignore")
        client = _client(url, api_key)
        try:
            current = client.release(channel)
        except FieldError as exc:
            raise _fail(str(exc)) from exc
        if current is None:
            raise _fail(f"no release is on the {channel} channel; promote one first")
        try:
            fleet = yaml.safe_load(robots.read_text())["robots"]
        except (OSError, KeyError, TypeError, yaml.YAMLError) as exc:
            raise _fail(f"{robots}: expected a mapping with a 'robots' list: {exc}") from exc

        env_cls = get_env_class(env)
        try:
            loaded = load_policy(policy, action_dim=env_cls([]).action_dim(), device=device)
        except PolicyError as exc:
            raise _fail(str(exc)) from exc

        for index, spec in enumerate(fleet):
            perturbations = build_all(spec.get("conditions", []))
            sim = [p for p in perturbations if isinstance(p, SimPerturbation)]
            io = [p for p in perturbations if isinstance(p, IoPerturbation)]
            delay_steps = sum(getattr(p, "steps", 0) for p in io if p.name == "action_latency")
            loaded.configure(action_delay_steps=delay_steps)
            world = env_cls(sim)
            wins = 0
            for attempt in range(episodes):
                episode_seed = seed + index * 1000 + attempt
                rngs = [np.random.default_rng([episode_seed, i]) for i in range(len(io))]
                for p, rng in zip(io, rngs):
                    p.begin_episode(rng)
                obs = world.reset(episode_seed)
                loaded.reset(episode_seed)
                with client.episode(
                    release=current,
                    robot=spec["name"],
                    site=spec.get("site", ""),
                    control_hz=world.fps,
                    simulated=True,
                ) as episode:
                    succeeded = False
                    for step in range(env_cls.default_max_steps):
                        seen = obs
                        for p, rng in zip(io, rngs):
                            seen = p.transform_observation(seen, rng, step)
                        episode.frame(next(iter(seen.images.values())))
                        with episode.inference():
                            action = loaded.act(seen)
                        for p, rng in zip(io, rngs):
                            action = p.transform_action(action, rng, step)
                        obs, result = world.step(action)
                        if result.terminated:
                            succeeded = result.success
                            break
                    # A stand-in robot knows its delay exactly; a real one measures it.
                    episode.action_delay(1000.0 * delay_steps / world.fps)
                    episode.finish(
                        success=succeeded,
                        intervention=not succeeded,
                        intervention_reason="" if succeeded else "task not completed in time",
                    )
                wins += succeeded
            world.close()
            console.print(f"{spec['name']}: {wins}/{episodes} succeeded")
        client.close()
        if client.pending or client.rejected:
            raise _fail(
                f"{client.pending} reports could not be sent and "
                f"{len(client.rejected)} were refused"
            )
        console.print(f"[green]reported[/] {len(fleet) * episodes} simulated attempts")


def _print_recommendation(rec) -> None:
    from rich.table import Table

    table = Table(title="Runtime settings", title_justify="left", header_style="bold")
    table.add_column("")
    table.add_column("Setting")
    table.add_column("Success", justify="right")
    table.add_column("95% interval", justify="right", style="dim")
    table.add_column("Worst condition", justify="right")
    table.add_column("p against best", justify="right")
    tied = {c.label for c in rec.tied}
    for c in rec.ranked:
        low, high = c.interval
        p = rec.p_values.get(c.label)
        table.add_row(
            "→" if c.label == rec.chosen.label else "",
            c.label,
            f"{c.rate:.0%}  {c.successes}/{c.episodes}",
            f"{low:.0%}–{high:.0%}",
            f"{c.worst_rate:.0%}  {c.worst_condition}",
            "–" if p is None else f"{p:.3f}" + ("" if c.label in tied else " *"),
        )
    console.print(table)
    if any(c.label not in tied for c in rec.ranked):
        console.print("[dim]* clearly worse than the best setting[/]")
    console.print(f"\n[bold]Use {rec.chosen.label}[/]  {rec.chosen.spec}")
    console.print(rec.reason)
    for line in rec.tolerance:
        console.print(f"  {line}")


def register_tune(app: typer.Typer) -> None:
    @app.command()
    def recommend(
        runs: list[Path] = typer.Argument(..., help="Two or more run directories or result files."),
        default: str | None = typer.Option(
            None, "--default", help="Label of the setting the policy was published with."
        ),
        as_json: bool = typer.Option(False, "--json"),
    ) -> None:
        """Choose between runtime settings that were each run on the same suite."""
        from shakedown.tune import recommend as choose

        results = []
        for path in runs:
            file = path / "result.json" if path.is_dir() else path
            try:
                results.append(json.loads(file.read_text()))
            except (OSError, ValueError) as exc:
                raise _fail(f"could not read {file}: {exc}") from exc
        if len(results) < 2:
            raise _fail("give at least two runs to choose between")
        rec = choose(results, default_label=default)
        if as_json:
            console.print_json(json.dumps(rec.to_json()))
        else:
            _print_recommendation(rec)

    @app.command()
    def tune(
        suite: Path = typer.Argument(..., help="A scenario file or a directory of them."),
        policy: str = typer.Option(..., "--policy", "-p", help="lerobot:<checkpoint>."),
        sweep: list[str] = typer.Option(
            ...,
            "--sweep",
            "-s",
            help="A setting and the values to try, e.g. n_action_steps=25,50,100. Repeatable.",
        ),
        out: Path = typer.Option(Path("runs/tune"), "--out", "-o"),
        episodes: int | None = typer.Option(None, "--episodes", "-n", min=1),
        workers: int = typer.Option(1, "--workers", "-w", min=1),
        device: str | None = typer.Option(None, "--device"),
    ) -> None:
        """Run a suite under several runtime settings and choose one.

        The policy as given is always included, as the setting to beat.
        """
        import itertools
        import subprocess
        import sys

        axes = []
        for item in sweep:
            name, _, values = item.partition("=")
            if not name or not values:
                raise _fail(f"--sweep {item!r}: expected name=value,value,...")
            axes.append((name, [v for v in values.split(",") if v]))
        joiner = "&" if "?" in policy else "?"
        variants = [("published", policy)]
        for combo in itertools.product(*[values for _, values in axes]):
            pairs = [(name, value) for (name, _), value in zip(axes, combo)]
            label = "+".join(f"{n}={v}" for n, v in pairs)
            variants.append((label, policy + joiner + "&".join(f"{n}={v}" for n, v in pairs)))

        results = []
        for label, spec in variants:
            target = out / "".join(ch if ch.isalnum() or ch in "._=+-" else "_" for ch in label)
            command = [
                sys.executable,
                "-m",
                "shakedown.cli",
                "run",
                str(suite),
                "--policy",
                spec,
                "--label",
                label,
                "--out",
                str(target),
                "--workers",
                str(workers),
                "--videos",
                "none",
                "--no-progress",
            ]
            if episodes:
                command += ["--episodes", str(episodes)]
            if device:
                command += ["--device", device]
            console.print(f"[dim]running[/] {label}")
            # Each setting runs in its own process, so nothing carries over between them.
            done = subprocess.run(command, capture_output=True, text=True, check=False)
            if done.returncode == 2 or not (target / "result.json").is_file():
                raise _fail(f"{label} could not be run:\n{done.stderr.strip()[-1500:]}")
            results.append(json.loads((target / "result.json").read_text()))

        from shakedown.tune import recommend as choose

        rec = choose(results, default_label="published")
        (out / "recommendation.json").write_text(json.dumps(rec.to_json(), indent=2))
        console.print()
        _print_recommendation(rec)
        console.print(f"[dim]written to {out / 'recommendation.json'}[/]")
