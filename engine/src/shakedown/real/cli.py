"""`shakedown real`: record real-robot trials and compare them with simulation."""

from __future__ import annotations

import json
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

console = Console()
err = Console(stderr=True)


def _fail(message: str) -> typer.Exit:
    err.print(f"[bold red]error:[/] {message}")
    return typer.Exit(2)


def register(app: typer.Typer) -> None:
    @app.command()
    def record(
        suite: Path = typer.Argument(..., help="The scenario suite that was run in simulation."),
        policy_label: str = typer.Option(
            ..., "--policy-label", "-l", help="Label of the policy, as used in the simulated run."
        ),
        trials: int = typer.Option(10, "--trials", "-n", min=1, help="Trials per condition."),
        out: Path = typer.Option(Path("real-trials.jsonl"), "--out", "-o"),
        robot: str = typer.Option("", "--robot", help="Which robot, e.g. so101."),
        operator: str = typer.Option("", "--operator"),
        only: list[str] | None = typer.Option(
            None, "--only", help="Record only these condition keys. Repeatable."
        ),
    ) -> None:
        """Log the outcome of real-robot trials, one condition at a time.

        Shakedown does not move the robot. For each trial, set up the condition
        shown, run the policy with your own tooling, then record the outcome.
        """
        from shakedown.perturbations import build_all
        from shakedown.real.trials import Trial, append_trial, next_trial_number, read_trials
        from shakedown.scenario import ScenarioError, expand, load_suite

        try:
            loaded = load_suite(suite)
        except ScenarioError as exc:
            raise _fail(str(exc)) from exc
        suite_name = suite.stem if suite.is_file() else suite.resolve().name
        conditions = [c for item in loaded for c in expand(item.scenario)]
        if only:
            unknown = set(only) - {c.key for c in conditions}
            if unknown:
                raise _fail(f"no such condition: {', '.join(sorted(unknown))}")
            conditions = [c for c in conditions if c.key in set(only)]

        console.print(
            f"Recording to [bold]{out}[/]. Answer [bold]y[/] success, [bold]n[/] failure, "
            "[bold]s[/] skip the rest of this condition, [bold]q[/] quit.\n"
        )
        for condition in conditions:
            existing = read_trials(out)
            start = next_trial_number(existing, suite_name, condition.key, policy_label)
            if start >= trials:
                console.print(f"[dim]{condition.key}: {start} trials already recorded[/]")
                continue
            console.rule(condition.label)
            if condition.description:
                console.print(condition.description)
            described = [p.describe() for p in build_all(condition.perturbations)]
            console.print(
                "Set up: " + ("; ".join(described) if described else "the nominal scene, unchanged")
            )
            for number in range(start, trials):
                answer = (
                    typer.prompt(f"  trial {number + 1}/{trials} succeeded? [y/n/s/q]")
                    .strip()
                    .lower()
                )
                while answer not in ("y", "n", "s", "q"):
                    answer = typer.prompt("  please answer y, n, s or q").strip().lower()
                if answer == "q":
                    console.print(f"Stopped. Trials so far are saved in {out}.")
                    raise typer.Exit()
                if answer == "s":
                    break
                notes = (
                    ""
                    if answer == "y"
                    else typer.prompt("  what went wrong?", default="", show_default=False)
                )
                append_trial(
                    out,
                    Trial(
                        suite=suite_name,
                        condition_key=condition.key,
                        policy_label=policy_label,
                        trial=number,
                        success=answer == "y",
                        robot=robot,
                        operator=operator,
                        notes=notes,
                    ),
                )
        console.print(f"\n[green]Done.[/] Next: shakedown real correlate <run> {out}")

    @app.command()
    def correlate(
        run: Path = typer.Argument(..., help="A simulated run directory or result file."),
        trials: Path = typer.Argument(Path("real-trials.jsonl"), help="The real-trial log."),
        upload: bool = typer.Option(False, "--upload", help="Send the real trials to the server."),
        url: str | None = typer.Option(None, "--url", envvar="SHAKEDOWN_URL"),
        api_key: str | None = typer.Option(None, "--api-key", envvar="SHAKEDOWN_API_KEY"),
        as_json: bool = typer.Option(False, "--json", help="Print the comparison as JSON."),
        robot: str | None = typer.Option(None, "--robot", help="Use only trials from this robot."),
    ) -> None:
        """Compare simulated success rates with those measured on the real robot."""
        from shakedown.real.correlate import correlate as compute
        from shakedown.real.trials import read_trials

        path = run / "result.json" if run.is_dir() else run
        try:
            result = json.loads(path.read_text())
            log = read_trials(trials)
        except (OSError, ValueError) as exc:
            raise _fail(str(exc)) from exc
        if not log:
            raise _fail(f"{trials} has no trials. Record some with: shakedown real record")

        robots = sorted({t.robot for t in log})
        if robot is None and len(robots) > 1:
            raise _fail(
                f"the log has trials from several robots ({', '.join(r or 'unnamed' for r in robots)}). "
                "Choose one with --robot."
            )
        outcome = compute(result, log, robot)
        if as_json:
            console.print_json(json.dumps(outcome.to_json()))
        else:
            table = Table(
                title=f"{outcome.policy_label}: simulation against the real robot",
                title_justify="left",
                header_style="bold",
            )
            table.add_column("Condition")
            table.add_column("Simulated", justify="right")
            table.add_column("Real", justify="right")
            table.add_column("Real 95% interval", justify="right", style="dim")
            table.add_column("Gap, pts", justify="right")
            for p in sorted(outcome.pairs, key=lambda p: -abs(p.gap)):
                gap = f"{p.gap * 100:+.0f}" + (" *" if p.sim_outside_real_interval else "")
                table.add_row(
                    p.label,
                    f"{p.sim_rate:.0%} (n={p.sim_n})",
                    f"{p.real_rate:.0%} (n={p.real_n})",
                    f"{p.real_low:.0%}–{p.real_high:.0%}",
                    f"[yellow]{gap}[/]" if p.sim_outside_real_interval else gap,
                )
            console.print(table)
            r = "–" if outcome.pearson is None else f"{outcome.pearson:.2f}"
            v = "–" if outcome.mmrv is None else f"{outcome.mmrv:.2f}"
            console.print(f"Pearson r {r}   mean max rank violation {v}")
            if any(p.sim_outside_real_interval for p in outcome.pairs):
                console.print("[dim]* the simulated rate is outside the real 95% interval[/]")
            console.print(f"[bold]{outcome.summary.capitalize()}.[/]")
            if not outcome.pairs:
                console.print(
                    f"[dim]The log has trials for policy label(s): "
                    f"{', '.join(sorted({t.policy_label for t in log}))}[/]"
                )

        if upload:
            from shakedown.upload import Client, UploadError

            mine = [
                t
                for t in log
                if t.policy_label == outcome.policy_label
                and t.suite == result["suite"]
                and (robot is None or t.robot == robot)
            ]
            if not mine:
                raise _fail("no trials for this policy label to upload")
            try:
                client = Client(api_key=api_key, url=url)
                for suite_name in sorted({t.suite for t in mine}):
                    batch = [t for t in mine if t.suite == suite_name]
                    for robot in sorted({t.robot for t in batch}):
                        client._request(
                            "POST",
                            "/real-trials",
                            json={
                                "suite": suite_name,
                                "policy_label": outcome.policy_label,
                                "robot": robot,
                                "trials": [
                                    {
                                        "condition_key": t.condition_key,
                                        "trial": t.trial,
                                        "success": t.success,
                                        "operator": t.operator,
                                        "notes": t.notes,
                                        "recorded_at": t.recorded_at,
                                    }
                                    for t in batch
                                    if t.robot == robot
                                ],
                            },
                        )
                client.close()
            except UploadError as exc:
                raise _fail(str(exc)) from exc
            console.print(f"[green]uploaded[/] {len(mine)} trials")

    @app.command()
    def run(
        plan: Path = typer.Argument(..., help="The experiment plan, a YAML file."),
        robot: str = typer.Option("so101_follower", "--robot", help="LeRobot robot type."),
        port: str | None = typer.Option(None, "--port", help="Serial port of the arm."),
        camera: list[str] = typer.Option(
            [], "--camera", "-c", help="A camera as name=index, e.g. top=0. Repeatable."
        ),
        fps: int = typer.Option(30, "--fps", min=1, max=200),
        out: Path = typer.Option(Path("real-trials.jsonl"), "--out", "-o"),
        operator: str = typer.Option("", "--operator"),
        device: str | None = typer.Option(None, "--device"),
        report: bool = typer.Option(
            False, "--report", help="Also send each attempt to the server as a field report."
        ),
        mock: bool = typer.Option(
            False, "--mock", help="Use a stand-in arm, to rehearse the session without hardware."
        ),
    ) -> None:
        """Run an experiment on a real arm: several settings, interleaved, judged blind.

        You are shown the attempt number, never which setting is running. Reset
        the scene, press Enter, watch, then say whether it succeeded.
        """
        import warnings

        from shakedown.policies import PolicyError, load_policy
        from shakedown.real.experiment import load_plan, remaining
        from shakedown.real.robot import LeRobotLink, MockLink, RobotError, run_trial
        from shakedown.real.trials import Trial, append_trial, read_trials

        warnings.filterwarnings("ignore")
        try:
            experiment = load_plan(plan)
        except ValueError as exc:
            raise _fail(str(exc)) from exc

        cameras: dict[str, int | str] = {}
        for item in camera:
            name, _, source = item.partition("=")
            if not name or not source:
                raise _fail(f"--camera {item!r}: expected name=index")
            cameras[name] = int(source) if source.isdigit() else source
        if mock:
            link = MockLink(fps=fps)
        else:
            if not port:
                raise _fail("give the arm's serial port with --port, or rehearse with --mock")
            if not cameras:
                raise _fail("give at least one camera with --camera name=index")
            link = LeRobotLink(robot, port, cameras, fps=fps, task=experiment.task)

        todo = remaining(experiment, read_trials(out))
        total = experiment.trials_per_arm * len(experiment.arms)
        if not todo:
            console.print(f"All {total} attempts are already in {out}.")
            raise typer.Exit()
        console.print(
            f"[bold]{experiment.name}[/]: {len(experiment.arms)} settings, "
            f"{experiment.trials_per_arm} attempts each. {len(todo)} of {total} to go."
        )

        policies = {}
        with console.status("loading policies"):
            for arm in experiment.arms:
                if arm.policy in policies:
                    continue
                try:
                    policies[arm.policy] = load_policy(arm.policy, action_dim=6, device=device)
                except PolicyError as exc:
                    raise _fail(f"{arm.label}: {exc}") from exc

        reporter = None
        if report:
            from shakedown.field import FieldClient, FieldError

            try:
                reporter = FieldClient()
            except FieldError as exc:
                raise _fail(str(exc)) from exc

        try:
            link.connect()
        except RobotError as exc:
            raise _fail(str(exc)) from exc
        console.print(
            "Before each attempt: reset the scene, then press Enter. "
            "Press Ctrl-C during an attempt to stop the arm.\n"
        )
        try:
            for number, arm in todo:
                position = total - len(todo) + todo.index((number, arm)) + 1
                answer = typer.prompt(
                    f"Attempt {position} of {total}. Enter to start, q to stop for now",
                    default="",
                    show_default=False,
                )
                if answer.strip().lower() == "q":
                    break
                delay_steps = round(arm.delay_ms / 1000.0 * link.fps)
                try:
                    result = run_trial(
                        link,
                        policies[arm.policy],
                        seed=experiment.seed * 100_000 + position,
                        max_seconds=experiment.max_seconds,
                        delay_steps=delay_steps,
                    )
                except KeyboardInterrupt:
                    console.print("\n[yellow]stopped.[/] This attempt is not recorded.")
                    continue
                except (RobotError, PolicyError) as exc:
                    raise _fail(str(exc)) from exc

                if mock:
                    success = link.succeeded()
                    console.print(f"  stand-in arm: {'succeeded' if success else 'failed'}")
                    notes = ""
                else:
                    verdict = ""
                    while verdict not in ("y", "n", "r"):
                        verdict = typer.prompt(
                            "  succeeded? y, n, or r to discard and redo"
                        ).lower()
                    if verdict == "r":
                        todo.append((number, arm))
                        continue
                    success = verdict == "y"
                    notes = (
                        ""
                        if success
                        else typer.prompt("  what went wrong?", default="", show_default=False)
                    )
                if result.overruns > result.steps * 0.1:
                    console.print(
                        f"  [yellow]note:[/] the loop fell behind on {result.overruns} of "
                        f"{result.steps} steps. The policy takes {result.inference_ms:.0f} ms and "
                        f"a step is {1000 / link.fps:.0f} ms."
                    )
                append_trial(
                    out,
                    Trial(
                        suite=experiment.name,
                        condition_key=arm.label,
                        policy_label=arm.label,
                        trial=number,
                        success=success,
                        robot="mock" if mock else robot,
                        operator=operator,
                        notes=notes,
                    ),
                )
                if reporter is not None:
                    reporter.report(
                        {
                            "id": f"{experiment.name}:{arm.label}:{number}",
                            "policy_label": arm.label,
                            "robot": "mock" if mock else robot,
                            "success": success,
                            "intervention": not success,
                            "note": notes,
                            "steps": result.steps,
                            "duration_s": round(result.duration_s, 3),
                            "measured": {
                                "inference_ms": round(result.inference_ms, 2),
                                "action_delay_ms": round(
                                    result.added_delay_ms + result.inference_ms, 2
                                ),
                                "control_hz": link.fps,
                                "image_brightness": round(result.mean_brightness, 2),
                            },
                            "simulated": mock,
                        }
                    )
        finally:
            link.disconnect()
            if reporter is not None:
                reporter.close()
        console.print(f"\nSaved to {out}. Next: shakedown real analyze {plan} {out}")

    @app.command()
    def analyze(
        plan: Path = typer.Argument(..., help="The experiment plan."),
        trials: Path = typer.Argument(Path("real-trials.jsonl"), help="The trial log."),
        as_json: bool = typer.Option(False, "--json"),
    ) -> None:
        """Success per setting, and whether the differences are more than chance."""
        from shakedown.real.experiment import analyze as compute
        from shakedown.real.experiment import load_plan
        from shakedown.real.trials import read_trials

        try:
            experiment = load_plan(plan)
            log = read_trials(trials)
        except (OSError, ValueError) as exc:
            raise _fail(str(exc)) from exc
        outcome = compute(experiment.name, log)
        if as_json:
            console.print_json(json.dumps(outcome))
            return
        if not outcome["arms"]:
            raise _fail(f"{trials} has no attempts for the experiment '{experiment.name}'")
        table = Table(title=experiment.name, title_justify="left", header_style="bold")
        table.add_column("Setting")
        table.add_column("Success", justify="right")
        table.add_column("95% interval", justify="right", style="dim")
        for arm in outcome["arms"]:
            table.add_row(
                arm["label"],
                f"{arm['rate']:.0%}  {arm['successes']}/{arm['trials']}",
                f"{arm['ci_low']:.0%}–{arm['ci_high']:.0%}",
            )
        console.print(table)
        for pair in outcome["pairs"]:
            clear = pair["p_adjusted"] < 0.05
            console.print(
                f"  {pair['better']} over {pair['worse']}: {pair['gap'] * 100:+.0f} points, "
                f"p = {pair['p_adjusted']:.3f} "
                + ("[green]clear[/]" if clear else "[dim]could be chance[/]")
            )
        short = [a for a in outcome["arms"] if a["trials"] < experiment.trials_per_arm]
        if short:
            console.print(
                f"[dim]{len(short)} setting(s) have fewer attempts than planned. "
                "Resume with: shakedown real run[/]"
            )
