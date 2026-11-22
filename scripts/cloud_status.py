"""Show recent cloud jobs and how long their conditions took.

    python scripts/cloud_status.py <job-id> [<job-id> ...]
"""

import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV = dict(
    line.split("=", 1)
    for line in (ROOT / "apps/web/.env.local").read_text().splitlines()
    if "=" in line and not line.startswith("#")
)
URL, TOKEN = ENV["SHAKEDOWN_CLOUD_URL"].rstrip("/"), ENV["SHAKEDOWN_CLOUD_TOKEN"]


def call(path):
    request = urllib.request.Request(URL + path, headers={"Authorization": f"Bearer {TOKEN}"})
    for _ in range(4):
        try:
            return json.load(urllib.request.urlopen(request, timeout=120))
        except OSError as exc:
            last = exc
    raise SystemExit(f"{path}: {last}")


for job in sys.argv[1:]:
    status = call(f"/jobs/{job}")
    print(job, status["state"], f"{len(status['done'])}/{len(status.get('planned', []))}",
          status.get("started_at"), status.get("error") or "")
    for key in status["done"]:
        c = call(f"/jobs/{job}/conditions/{key}")["condition"]
        print(f"   {key:16s} {c['successes']}/{c['episodes']}  {c['duration_s']:.0f}s  "
              f"{c['duration_s'] / max(1, c['episodes']):.0f}s per episode")
