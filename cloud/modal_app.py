"""Shakedown's cloud runner, on Modal.

Runs a suite against a public Hugging Face checkpoint with one container per
condition, so a full suite takes minutes. The web app starts jobs here and
collects the results; this service never talks to the database.

    modal deploy cloud/modal_app.py

Needs a Modal secret named `shakedown-cloud` holding SHAKEDOWN_CLOUD_TOKEN,
the bearer token the web app sends.

Layout of a job on the volume:

    /jobs/<id>/job.json                 what was asked for
    /jobs/<id>/state.json               queued | running | completed | failed
    /jobs/<id>/conditions/<key>.json    one finished condition
    /jobs/<id>/episodes/<key>/<seed>.*  traces and videos
    /jobs/<id>/result.json              the assembled result
"""

# No postponed annotations here: FastAPI has to resolve the request model, which is
# defined inside the function that builds the app.
import base64
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import modal

app = modal.App("shakedown")
volume = modal.Volume.from_name("shakedown-jobs", create_if_missing=True)
secret = modal.Secret.from_name("shakedown-cloud")
JOBS = Path("/jobs")
SUITES = Path("/root/scenarios")

#: Hard limits, enforced here as well as in the web app.
MAX_EPISODES = 50
MAX_CONDITIONS = 40
# Only suites that have completed on this runner. PushT runs locally but has not
# finished here, so it is not offered.
HOSTED_SUITES = ("aloha-transfer-cube", "aloha-latency", "aloha-insertion-latency")
POLICY = re.compile(r"^lerobot:[A-Za-z0-9][\w.-]{0,95}/[\w.-]{1,96}(\?[A-Za-z0-9_=&.]{1,200})?$")
JOB_ID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
SAFE = re.compile(r"^[A-Za-z0-9._@-]{1,200}$")

sim_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libegl1", "libgl1", "libglvnd0", "libosmesa6", "libglfw3", "ffmpeg", "git")
    .pip_install(
        "lerobot[aloha,pusht]==0.4.4",
        "pydantic>=2.6",
        "typer>=0.12",
        "rich>=13",
        "httpx>=0.27",
        "imageio[ffmpeg]>=2.34",
        "pillow>=10",
    )
    .env({"MUJOCO_GL": "egl", "SHAKEDOWN_CACHE": "/cache", "HF_HOME": "/cache/hf"})
    .add_local_dir("engine/src/shakedown", "/root/shakedown", copy=True)
    .add_local_dir("scenarios", str(SUITES), copy=True)
)
api_image = modal.Image.debian_slim(python_version="3.11").pip_install("fastapi[standard]==0.141.*")
cache = modal.Volume.from_name("shakedown-cache", create_if_missing=True)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _safe(name: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in name)


def _write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data))
    os.replace(tmp, path)


def _set_state(job_id: str, state: str, **extra) -> None:
    _write(JOBS / job_id / "state.json", {"state": state, "updated_at": _now(), **extra})
    volume.commit()


@app.function(
    image=sim_image,
    gpu="T4",
    timeout=60 * 40,
    # No automatic retries: a condition that runs out of time would only do so again,
    # at the same cost.
    retries=0,
    volumes={str(JOBS): volume, "/cache": cache},
    max_containers=24,
)
def run_condition(job_id: str, planned: dict) -> str:
    """Run one condition in its own container."""
    from shakedown.hosted import run_one

    volume.reload()
    root = JOBS / job_id
    job = json.loads((root / "job.json").read_text())
    try:
        result = run_one(
            planned,
            policy_spec=job["policy"],
            policy_label=job["label"],
            out_dir=root,
            baseline=job.get("baseline"),
        )
    except Exception as exc:  # noqa: BLE001 - reported against the condition
        result = {
            "key": planned["key"],
            "scenario": planned["scenario"],
            "label": planned["label"],
            "failed_to_run": f"{type(exc).__name__}: {exc}"[:2000],
        }
    _write(root / "conditions" / f"{_safe(planned['key'])}.json", result)
    volume.commit()
    cache.commit()
    return planned["key"]


@app.function(
    image=sim_image,
    timeout=60 * 90,
    volumes={str(JOBS): volume, "/cache": cache},
)
def run_job(job_id: str) -> None:
    """Plan a job, fan its conditions out, and assemble the result."""
    from shakedown.hosted import assemble, plan

    volume.reload()
    root = JOBS / job_id
    job = json.loads((root / "job.json").read_text())
    started, started_at = time.time(), _now()
    try:
        planned = plan(SUITES / job["suite"], job["episodes"])[:MAX_CONDITIONS]
        order = [p["key"] for p in planned]
        public = [
            {k: p[k] for k in ("key", "label", "scenario", "episodes")} for p in planned
        ]
        _set_state(job_id, "running", planned=public, started_at=started_at)

        # Unperturbed conditions go first: their action traces are the reference
        # that failures in every other condition are compared with.
        first = [p for p in planned if p["nominal"]]
        rest = [p for p in planned if not p["nominal"]]
        list(run_condition.map([job_id] * len(first), first))
        list(run_condition.map([job_id] * len(rest), rest, order_outputs=False))

        volume.reload()
        conditions = [
            json.loads(f.read_text()) for f in sorted((root / "conditions").glob("*.json"))
        ]
        broken = [c for c in conditions if "failed_to_run" in c]
        if broken:
            raise RuntimeError(f"{broken[0]['key']}: {broken[0]['failed_to_run']}")
        info = conditions[0].get("policy_info", {}) if conditions else {}
        result = assemble(
            run_id=job_id,
            suite=job["suite"],
            policy_label=job["label"],
            policy_spec=job["policy"],
            policy_info=info,
            conditions=conditions,
            order=order,
            started_at=started_at,
            finished_at=_now(),
            duration_s=time.time() - started,
            baseline=job.get("baseline"),
        )
        _write(root / "result.json", result)
        _set_state(job_id, "completed", planned=public, started_at=started_at)
    except Exception as exc:  # noqa: BLE001 - the job's owner is told what went wrong
        _set_state(job_id, "failed", error=f"{type(exc).__name__}: {exc}"[:2000])


@app.function(image=api_image, volumes={str(JOBS): volume}, secrets=[secret])
@modal.concurrent(max_inputs=20)
@modal.asgi_app()
def api():
    import hmac

    from fastapi import Depends, FastAPI, Header, HTTPException, Request
    from pydantic import BaseModel, Field, ValidationError

    web = FastAPI(title="Shakedown cloud runner", docs_url=None, redoc_url=None)

    def authorize(authorization: str | None = Header(default=None)) -> None:
        expected = os.environ["SHAKEDOWN_CLOUD_TOKEN"]
        given = (authorization or "").removeprefix("Bearer ").strip()
        if not given or not hmac.compare_digest(given, expected):
            raise HTTPException(status_code=401, detail="invalid or missing token")

    def job_dir(job_id: str) -> Path:
        if not JOB_ID.match(job_id):
            raise HTTPException(status_code=404, detail="no such job")
        volume.reload()
        root = JOBS / job_id
        if not (root / "job.json").is_file():
            raise HTTPException(status_code=404, detail="no such job")
        return root

    class NewJob(BaseModel):
        job_id: str = Field(pattern=JOB_ID.pattern)
        policy: str = Field(max_length=300)
        suite: str
        label: str = Field(min_length=1, max_length=120)
        episodes: int = Field(ge=1, le=MAX_EPISODES)
        baseline: dict | None = None

    @web.get("/health")
    def health() -> dict:
        return {"ok": True, "suites": list(HOSTED_SUITES), "max_episodes": MAX_EPISODES}

    @web.post("/jobs", dependencies=[Depends(authorize)], status_code=201)
    async def create(request: Request) -> dict:
        # The body is validated by hand. Declaring the model as a parameter did
        # not work here: the framework read it as a query parameter.
        try:
            body = NewJob.model_validate(await request.json())
        except ValidationError as exc:
            issue = exc.errors()[0]
            where = ".".join(str(part) for part in issue["loc"])
            raise HTTPException(status_code=400, detail=f"{where}: {issue['msg']}") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="the body is not valid JSON") from exc
        if body.suite not in HOSTED_SUITES:
            raise HTTPException(status_code=400, detail=f"unknown suite '{body.suite}'")
        if not POLICY.match(body.policy):
            raise HTTPException(
                status_code=400,
                detail="policy must be lerobot:<owner>/<model>, a public Hugging Face model",
            )
        root = JOBS / body.job_id
        volume.reload()
        if (root / "job.json").exists():
            raise HTTPException(status_code=409, detail="this job already exists")
        _write(root / "job.json", body.model_dump())
        _write(root / "state.json", {"state": "queued", "updated_at": _now()})
        volume.commit()
        run_job.spawn(body.job_id)
        return {"job_id": body.job_id, "state": "queued"}

    @web.get("/jobs/{job_id}", dependencies=[Depends(authorize)])
    def status(job_id: str) -> dict:
        root = job_dir(job_id)
        state = json.loads((root / "state.json").read_text())
        done = []
        for f in sorted((root / "conditions").glob("*.json")) if (root / "conditions").is_dir() else []:
            data = json.loads(f.read_text())
            if "failed_to_run" not in data:
                done.append(data["key"])
        return {**state, "job_id": job_id, "done": done}

    @web.get("/jobs/{job_id}/conditions/{name}", dependencies=[Depends(authorize)])
    def condition(job_id: str, name: str) -> dict:
        """One finished condition with its traces and videos."""
        root = job_dir(job_id)
        if not SAFE.match(name):
            raise HTTPException(status_code=404, detail="no such condition")
        path = root / "conditions" / f"{_safe(name)}.json"
        if not path.is_file():
            raise HTTPException(status_code=404, detail="no such condition")
        data = json.loads(path.read_text())
        data.pop("policy_info", None)
        files = []
        folder = root / "episodes" / _safe(name)
        for f in sorted(folder.glob("*")) if folder.is_dir() else []:
            if f.suffix not in (".json", ".mp4"):
                continue
            files.append(
                {
                    "path": f"episodes/{_safe(name)}/{f.name}",
                    "content_type": "video/mp4" if f.suffix == ".mp4" else "application/json",
                    "data": base64.b64encode(f.read_bytes()).decode("ascii"),
                }
            )
        return {"condition": data, "files": files}

    @web.get("/jobs/{job_id}/result", dependencies=[Depends(authorize)])
    def result(job_id: str) -> dict:
        path = job_dir(job_id) / "result.json"
        if not path.is_file():
            raise HTTPException(status_code=404, detail="the job has not finished")
        data = json.loads(path.read_text())
        # Conditions are collected one by one; the summary is all that is needed here.
        data.pop("conditions", None)
        return data

    return web
