"""Render a run result for terminals, pull requests and CI systems."""

from __future__ import annotations

from typing import Any
from xml.etree import ElementTree as ET

from rich.console import Console
from rich.table import Table
from rich.text import Text

_STYLE = {
    "PASS": "green",
    "WARN": "yellow",
    "FAIL": "bold red",
    "SKIP": "dim",
    "ERROR": "bold magenta",
}
_MARK = {"PASS": "✓", "WARN": "!", "FAIL": "✗", "SKIP": "–", "ERROR": "E"}


def _pct(x: float | None) -> str:
    return "–" if x is None else f"{x * 100:.0f}%"


def _delta(c: dict[str, Any]) -> str:
    cmp = c.get("comparison")
    if not cmp:
        return "–"
    points = cmp["delta"] * 100
    if abs(points) < 0.5:
        return "0"
    return f"{points:+.0f}"


def _headline(c: dict[str, Any]) -> str:
    """The most important check message for a condition."""
    rank = {"ERROR": 4, "FAIL": 3, "WARN": 2, "PASS": 1, "SKIP": 0}
    if c.get("error"):
        return c["error"]
    checks = sorted(c["checks"], key=lambda ch: -rank[ch["verdict"]])
    return checks[0]["message"] if checks else "no assertions"


def print_terminal(result: dict[str, Any], console: Console | None = None) -> None:
    console = console or Console()
    policy = result["policy"]["label"]
    baseline = (result.get("baseline") or {}).get("label")
    title = f"{result['suite']}  ·  {policy}"
    if baseline:
        title += f"  vs  {baseline}"

    table = Table(title=title, title_justify="left", header_style="bold", expand=False)
    table.add_column("", width=1)
    table.add_column("Condition", overflow="fold")
    table.add_column("Success", justify="right")
    table.add_column("95% interval", justify="right", style="dim")
    table.add_column("Δ pts", justify="right")
    table.add_column("Result", overflow="fold")
    for c in result["conditions"]:
        style = _STYLE[c["verdict"]]
        table.add_row(
            Text(_MARK[c["verdict"]], style=style),
            c["label"],
            f"{_pct(c['success_rate'])}  {c['successes']}/{c['episodes']}",
            f"{_pct(c['ci_low'])}–{_pct(c['ci_high'])}",
            _delta(c),
            Text(_headline(c), style=style if c["verdict"] != "PASS" else ""),
        )
    console.print(table)

    s = result["summary"]
    parts = [f"{s['pass']} passed"]
    if s["warn"]:
        parts.append(f"{s['warn']} warned")
    if s["fail"]:
        parts.append(f"{s['fail']} failed")
    if s["error"]:
        parts.append(f"{s['error']} errored")
    console.print(
        Text(f"{result['verdict']}  ", style=_STYLE[result["verdict"]]),
        ", ".join(parts),
        f" ·  {s['episodes']} episodes in {result['duration_s']:.0f}s",
    )


def to_markdown(result: dict[str, Any], url: str | None = None) -> str:
    """Summary for a pull request comment or the GitHub Actions job summary."""
    icon = {"PASS": "PASS", "WARN": "WARN", "FAIL": "FAIL", "SKIP": "SKIP", "ERROR": "ERROR"}
    s = result["summary"]
    baseline = (result.get("baseline") or {}).get("label")
    lines = [
        f"### Shakedown: {result['verdict']}",
        "",
        f"**Policy** `{result['policy']['label']}`"
        + (f" compared with `{baseline}`" if baseline else " (no baseline)")
        + f" · **Suite** `{result['suite']}` · {s['episodes']} episodes",
        "",
    ]
    if s["regressions"]:
        lines += [f"**{s['regressions']} regression(s)** found.", ""]
    lines += [
        "| | Condition | Success | 95% interval | Δ pts | Result |",
        "|---|---|---:|---:|---:|---|",
    ]
    for c in result["conditions"]:
        lines.append(
            f"| {icon[c['verdict']]} | `{c['label']}` | {_pct(c['success_rate'])} "
            f"({c['successes']}/{c['episodes']}) | {_pct(c['ci_low'])}–{_pct(c['ci_high'])} "
            f"| {_delta(c)} | {_headline(c)} |"
        )
    if url:
        lines += ["", f"[Open the run in Shakedown]({url}) for replays of each failure."]
    return "\n".join(lines) + "\n"


def to_junit(result: dict[str, Any]) -> str:
    """JUnit XML, one test case per condition, for CI systems that ingest it."""
    s = result["summary"]
    suite = ET.Element(
        "testsuite",
        name=f"shakedown.{result['suite']}",
        tests=str(s["conditions"]),
        failures=str(s["fail"]),
        errors=str(s["error"]),
        skipped=str(s["skip"]),
        time=f"{result['duration_s']:.2f}",
        timestamp=result["started_at"],
    )
    props = ET.SubElement(suite, "properties")
    ET.SubElement(props, "property", name="policy", value=result["policy"]["label"])
    ET.SubElement(props, "property", name="run_id", value=result["id"])
    for c in result["conditions"]:
        case = ET.SubElement(
            suite,
            "testcase",
            classname=f"shakedown.{c['scenario']}",
            name=c["key"],
            time=f"{c['duration_s']:.2f}",
        )
        body = "\n".join(f"[{ch['verdict']}] {ch['name']}: {ch['message']}" for ch in c["checks"])
        if c["verdict"] == "FAIL":
            ET.SubElement(case, "failure", message=_headline(c)).text = body
        elif c["verdict"] == "ERROR":
            ET.SubElement(case, "error", message=_headline(c)).text = c.get("error") or body
        elif c["verdict"] == "SKIP":
            ET.SubElement(case, "skipped", message=_headline(c))
        ET.SubElement(case, "system-out").text = (
            f"success_rate={c['success_rate']:.4f} n={c['episodes']} "
            f"ci=[{c['ci_low']:.4f}, {c['ci_high']:.4f}]\n{body}"
        )
    ET.indent(suite)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(suite, encoding="unicode") + "\n"
    )
