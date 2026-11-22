"""Run suites on the cloud runner and save the results locally.

    python scripts/cloud_run.py <suite> <out-dir> label=policy-spec [label=policy-spec ...]

Reads the runner's address and token from apps/web/.env.local.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV = dict(
    line.split("=", 1)
    for line in (ROOT / "apps/web/.env.local").read_text().splitlines()
    if "=" in line and not line.startswith("#")
)
URL, TOKEN = ENV["SHAKEDOWN_CLOUD_URL"].rstrip("/"), ENV["SHAKEDOWN_CLOUD_TOKEN"]


def call(method: str, path: str, body: dict | None = None) -> dict:
    request = urllib.request.Request(
        f"{URL}{path}",
        method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as exc:
            if exc.code < 500:
                raise SystemExit(f"{method} {path}: {exc.code} {exc.read().decode()[:300]}")
        except OSError:
            pass
        time.sleep(3 * (attempt + 1))
    raise SystemExit(f"{method} {path}: no response")


def main() -> None:
    suite, out = sys.argv[1], Path(sys.argv[2])
    episodes = 50
    jobs = {}
    for arg in sys.argv[3:]:
        label, spec = arg.split("=", 1)
        job_id = str(uuid.uuid4())
        call("POST", "/jobs", {"job_id": job_id, "policy": spec, "suite": suite,
                               "label": label, "episodes": episodes})
        jobs[label] = job_id
        print(f"started {label} {job_id}", flush=True)
    out.mkdir(parents=True, exist_ok=True)
    (out / "jobs.json").write_text(json.dumps(jobs, indent=2))

    pending = dict(jobs)
    while pending:
        time.sleep(20)
        for label, job_id in list(pending.items()):
            status = call("GET", f"/jobs/{job_id}")
            if status["state"] == "failed":
                print(f"FAILED {label}: {status.get('error')}", flush=True)
                del pending[label]
            elif status["state"] == "completed":
                result = call("GET", f"/jobs/{job_id}/result")
                result["conditions"] = [
                    call("GET", f"/jobs/{job_id}/conditions/{key}")["condition"]
                    for key in status["done"]
                ]
                target = out / label
                target.mkdir(parents=True, exist_ok=True)
                (target / "result.json").write_text(json.dumps(result, indent=2))
                print(f"done {label} in {result['duration_s']:.0f}s "
                      f"{result['summary']['success_rate']:.1%}", flush=True)
                del pending[label]
    print("ALL DONE", flush=True)


if __name__ == "__main__":
    main()
