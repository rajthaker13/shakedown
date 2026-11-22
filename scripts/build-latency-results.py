"""Build the README's delay result from the six runs in results/runs/latency.

    python scripts/build-latency-results.py

Writes results/latency-skip-stale.json (per-cell counts and 95% Wilson
intervals, copied from each run's result.json) and results/latency-skip-stale.svg
(the 50-step series). The chart needs matplotlib: pip install matplotlib
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / "results/runs/latency"
OUT_JSON = ROOT / "results/latency-skip-stale.json"
OUT_SVG = ROOT / "results/latency-skip-stale.svg"

STEP_MS = 20
#: ACT's default number of actions executed per plan, used when the spec does not set one.
ACT_DEFAULT_STEPS = 100
JOBS = ["n25", "n25-comp", "n50", "n50-comp", "n100", "n100-comp"]
CHART_JOBS = ("n50", "n50-comp")


def _cell(condition: dict) -> dict:
    return {
        "episodes": condition["episodes"],
        "successes": condition["successes"],
        "success_rate": condition["success_rate"],
        "ci95_low": condition["ci_low"],
        "ci95_high": condition["ci_high"],
    }


def _delay_steps(condition: dict) -> int:
    return sum(
        p["action_latency"]["steps"] for p in condition["perturbations"] if "action_latency" in p
    )


def build_series(job: str) -> dict:
    path = RUNS / job / "result.json"
    run = json.loads(path.read_text())
    info = run["policy"]["info"]
    points, longer = [], []
    for condition in run["conditions"]:
        if condition["scenario"] == "latency-longer-limit":
            longer.append({"condition": condition["key"], **_cell(condition)})
        else:
            steps = _delay_steps(condition)
            points.append({"delay_steps": steps, "delay_ms": steps * STEP_MS, **_cell(condition)})
    return {
        "job": job,
        "run_id": run["id"],
        "policy_spec": run["policy"]["spec"],
        "checkpoint": info["checkpoint"],
        "n_action_steps": info["options"].get("n_action_steps", ACT_DEFAULT_STEPS),
        "skip_stale": info["latency_compensation"] == "auto",
        "host": run["host"]["platform"],
        "device": info["device"],
        "started_at": run["started_at"],
        "points": sorted(points, key=lambda p: p["delay_steps"]),
        "longer_time_limit": longer,
        "source": str(path.relative_to(ROOT)),
    }


def build_summary() -> dict:
    series = [build_series(job) for job in JOBS]
    by_job = {s["job"]: s for s in series}
    plain, skip = (by_job[j]["points"][-1] for j in CHART_JOBS)
    return {
        "title": "Skipping stale actions under control delay (ACT, ALOHA transfer-cube, MuJoCo)",
        "metric": "task success rate; 95% Wilson interval; 50 seeded episodes per point (seed 1000)",
        "delay_note": f"one control step = {STEP_MS} ms (scenarios/aloha-latency)",
        "skip_stale_definition": (
            "latency_compensation=auto: when actions arrive d steps late, "
            "drop the first d actions of each new action chunk"
        ),
        "series": series,
        "headline": (
            f"n_action_steps=50 at {plain['delay_ms']} ms delay: "
            f"{plain['successes']}/{plain['episodes']} ({plain['success_rate']:.0%}) without skipping "
            f"vs {skip['successes']}/{skip['episodes']} ({skip['success_rate']:.0%}) with skipping"
        ),
    }


def plot(summary: dict) -> None:
    import matplotlib

    matplotlib.use("svg")
    import matplotlib.pyplot as plt

    background, grid, muted, ink = "#fcfcfb", "#e6e5e1", "#52514e", "#0b0b0b"
    plt.rcParams.update(
        {
            "font.family": ["Helvetica Neue", "Helvetica", "Arial", "DejaVu Sans"],
            "svg.fonttype": "none",
            "svg.hashsalt": "shakedown",
        }
    )
    fig = plt.figure(figsize=(7.2, 4.2), facecolor=background)
    ax = fig.add_axes((0.075, 0.14, 0.725, 0.66), facecolor=background)

    by_job = {s["job"]: s for s in summary["series"]}
    styles = [("n50", "#eb6834", "Without skipping"), ("n50-comp", "#2a78d6", "Skip stale actions")]
    for job, color, name in styles:
        points = by_job[job]["points"]
        x = [p["delay_ms"] for p in points]
        y = [p["success_rate"] for p in points]
        ax.fill_between(
            x,
            [p["ci95_low"] for p in points],
            [p["ci95_high"] for p in points],
            color=color,
            alpha=0.1,
            linewidth=0,
        )
        ax.plot(x, y, color=color, linewidth=2, solid_capstyle="round", zorder=3)
        ax.scatter(x, y, s=46, color=color, edgecolors=background, linewidths=2, zorder=4)
        ax.annotate(
            f"{name}  {y[-1]:.0%}",
            (x[-1], y[-1]),
            xytext=(10, 0),
            textcoords="offset points",
            va="center",
            fontsize=10,
            fontweight="semibold",
            color=ink,
            annotation_clip=False,
        )

    delays = [p["delay_ms"] for p in by_job["n50"]["points"]]
    ax.set_xlim(-8, 290)
    ax.set_ylim(0, 1)
    ax.set_xticks(delays, [str(d) for d in delays[:-1]] + [f"{delays[-1]} ms"])
    ax.set_yticks([0, 0.25, 0.5, 0.75, 1], ["0", "25", "50", "75", "100%"])
    ax.tick_params(length=0, labelsize=9, labelcolor=muted)
    ax.set_xlabel("Delay before each action reaches the robot", fontsize=9, color=muted)
    ax.grid(axis="y", color=grid, linewidth=1)
    ax.set_axisbelow(True)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(grid)
    ax.spines["bottom"].set_linewidth(0.8)

    fig.text(
        0.075,
        0.945,
        "Skipping stale actions keeps a robot policy working under delay",
        fontsize=12.5,
        fontweight="semibold",
        color=ink,
    )
    fig.text(
        0.075,
        0.855,
        "ACT on ALOHA transfer-cube (MuJoCo), 50-step action chunks.\n"
        "Success rate over 50 seeded episodes per point; bands are 95% intervals.",
        fontsize=8.6,
        color=muted,
        linespacing=1.4,
    )
    fig.savefig(OUT_SVG, facecolor=background, metadata={"Date": None})
    plt.close(fig)


def main() -> None:
    summary = build_summary()
    OUT_JSON.write_text(json.dumps(summary, indent=2) + "\n")
    print(f"wrote {OUT_JSON.relative_to(ROOT)}: {summary['headline']}")
    if "--no-chart" not in sys.argv[1:]:
        plot(summary)
        print(f"wrote {OUT_SVG.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
