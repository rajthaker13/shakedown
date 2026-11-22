"""Build the matrix shown on the landing page from real run results.

    python scripts/build-demo-fixture.py runs/act-chunk100 runs/act-chunk50 ...

Every number on the landing page comes from this file's output, so the page
can never show a result that was not produced by the engine.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "apps/web/src/lib/demo-matrix.json"
BASE = "/app/shakedown/aloha-transfer-cube"
RANK = {"ERROR": 4, "FAIL": 3, "WARN": 2, "PASS": 1, "SKIP": 0}


def headline(condition: dict) -> str:
    if condition.get("error"):
        return condition["error"]
    checks = sorted(condition["checks"], key=lambda c: -RANK[c["verdict"]])
    return checks[0]["message"] if checks else "No assertions were defined for this condition."


def main(paths: list[str]) -> None:
    results = []
    for p in paths:
        path = Path(p)
        path = path / "result.json" if path.is_dir() else path
        results.append(json.loads(path.read_text()))
    results.sort(key=lambda r: r["started_at"])

    columns, rows, cells = [], {}, {}
    for number, result in enumerate(results, start=1):
        columns.append(
            {
                "id": result["id"],
                "number": number,
                "label": result["policy"]["label"],
                "sha": None,
                "branch": None,
                "status": "completed",
                "startedAt": result["started_at"],
                "rate": result["summary"]["success_rate"],
                "href": f"{BASE}/runs/{number}",
            }
        )
        for c in result["conditions"]:
            rows.setdefault(
                c["key"],
                {
                    "key": c["key"],
                    "scenario": c["scenario"],
                    "label": c["label"],
                    "description": c["description"],
                    "tags": c["tags"],
                    "sweepName": c["sweep_name"],
                    "sweepValue": None if c["sweep_value"] is None else str(c["sweep_value"]),
                    "perturbations": c["perturbation_summary"],
                },
            )
            cells.setdefault(c["key"], {})[result["id"]] = {
                "n": c["episodes"],
                "successes": c["successes"],
                "rate": c["success_rate"],
                "ciLow": c["ci_low"],
                "ciHigh": c["ci_high"],
                "verdict": c["verdict"],
                "fingerprint": c["fingerprint"],
                "outcomes": c["outcomes"],
                "headline": headline(c),
                "href": f"{BASE}/runs/{number}/{quote(c['key'], safe='')}",
            }

    data = {
        "columns": columns,
        "rows": list(rows.values()),
        "cells": cells,
        "noiseThresholdPts": 5,
        "minEpisodes": 20,
        "meta": {
            "checkpoint": "lerobot/act_aloha_sim_transfer_cube_human",
            "env": results[0]["conditions"][0]["env"],
            "episodes": sum(r["summary"]["episodes"] for r in results),
            "engine": results[0]["engine_version"],
        },
    }
    OUT.write_text(json.dumps(data, separators=(",", ":")) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(columns)} columns, {len(rows)} rows")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
