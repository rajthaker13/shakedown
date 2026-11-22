"""Build the delay-compensation table shown on the landing page from real cloud runs.

    python scripts/build-latency-fixture.py runs/latency
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engine" / "src"))
from shakedown.stats import mcnemar_exact  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "apps/web/src/lib/demo-latency.json"
STEP_MS = 20
SETTINGS = [("n100", 100), ("n50", 50), ("n25", 25)]
DELAYS = [("nominal", 0), ("latency@2", 2), ("latency@5", 5), ("latency@10", 10)]


def main(folder: str) -> None:
    runs = {}
    for path in Path(folder).glob("*/result.json"):
        data = json.loads(path.read_text())
        runs[path.parent.name] = {c["key"]: c for c in data["conditions"]}
    rows = []
    for name, steps in SETTINGS:
        plain, comp = runs.get(name), runs.get(f"{name}-comp")
        if not plain or not comp:
            continue
        cells = []
        for key, delay in DELAYS:
            a, b = plain[key], comp[key]
            seeds = sorted(set(a["outcomes"]) & set(b["outcomes"]))
            test = mcnemar_exact([a["outcomes"][s] for s in seeds], [b["outcomes"][s] for s in seeds])
            cells.append(
                {
                    "delay_ms": delay * STEP_MS,
                    "plain": a["success_rate"],
                    "compensated": b["success_rate"],
                    "episodes": a["episodes"],
                    "fixed": test.improved,
                    "broke": test.regressed,
                    "p": test.p_value,
                }
            )
        longer = plain.get("latency-longer-limit@10")
        rows.append(
            {
                "n_action_steps": steps,
                "cells": cells,
                "plain_with_longer_limit_at_200ms": longer["success_rate"] if longer else None,
            }
        )
    OUT.write_text(json.dumps({"checkpoint": "lerobot/act_aloha_sim_transfer_cube_human", "rows": rows}, indent=2) + "\n")
    for row in rows:
        print(row["n_action_steps"], [(c["delay_ms"], round(c["plain"], 2), round(c["compensated"], 2), round(c["p"], 4)) for c in row["cells"]], row["plain_with_longer_limit_at_200ms"])


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "runs/latency")
