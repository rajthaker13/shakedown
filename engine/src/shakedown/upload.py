"""Send run results to a Shakedown server.

Results are streamed condition by condition so the dashboard's matrix fills
in while a run is still going. Videos and traces go straight to object
storage through short-lived signed URLs; they never pass through the API.
"""

from __future__ import annotations

import mimetypes
import os
from pathlib import Path
from typing import Any

import httpx


class UploadError(RuntimeError):
    pass


class Client:
    def __init__(self, api_key: str | None = None, url: str | None = None, timeout_s: float = 60):
        self.api_key = api_key or os.environ.get("SHAKEDOWN_API_KEY")
        if not self.api_key:
            raise UploadError(
                "no API key. Set SHAKEDOWN_API_KEY or pass --api-key. "
                "Create one under Settings, API keys."
            )
        target = url or os.environ.get("SHAKEDOWN_URL")
        if not target:
            raise UploadError(
                "no server URL. Set SHAKEDOWN_URL or pass --url, "
                "e.g. http://localhost:3400 for a local server."
            )
        self.url = target.rstrip("/")
        self._http = httpx.Client(
            base_url=f"{self.url}/api/v1",
            timeout=timeout_s,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "User-Agent": "shakedown-cli",
            },
        )
        self._raw = httpx.Client(timeout=300)

    def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        try:
            resp = self._http.request(method, path, **kwargs)
        except httpx.HTTPError as exc:
            raise UploadError(f"could not reach {self.url}: {exc}") from exc
        if resp.status_code >= 400:
            try:
                message = resp.json().get("error", resp.text)
            except ValueError:
                message = resp.text
            raise UploadError(f"{method} {path} failed ({resp.status_code}): {message[:500]}")
        return resp.json() if resp.content else {}

    # -- run lifecycle --------------------------------------------------------------

    def whoami(self) -> dict[str, Any]:
        return self._request("GET", "/whoami")

    def create_run(self, header: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/runs", json=header)

    def add_condition(self, run_id: str, condition: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", f"/runs/{run_id}/conditions", json=condition)

    def complete_run(self, run_id: str, footer: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", f"/runs/{run_id}/complete", json=footer)

    def baseline(self, suite: str, branch: str | None = None) -> dict[str, Any] | None:
        params = {"suite": suite}
        if branch:
            params["branch"] = branch
        data = self._request("GET", "/baseline", params=params)
        return data.get("result")

    # -- artifacts ------------------------------------------------------------------

    def upload_artifacts(self, run_id: str, run_dir: Path, paths: list[str]) -> int:
        """Upload files under `run_dir`, given as paths relative to it."""
        existing = [p for p in paths if (run_dir / p).is_file()]
        sent = 0
        for start in range(0, len(existing), 50):
            batch = existing[start : start + 50]
            signed = self._request("POST", f"/runs/{run_id}/artifacts", json={"paths": batch})
            for item in signed["uploads"]:
                file = run_dir / item["path"]
                content_type = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
                resp = self._raw.put(
                    item["url"],
                    content=file.read_bytes(),
                    headers={"Content-Type": content_type, "x-upsert": "true"},
                )
                if resp.status_code >= 400:
                    raise UploadError(
                        f"upload of {item['path']} failed ({resp.status_code}): {resp.text[:300]}"
                    )
                sent += 1
        return sent

    def close(self) -> None:
        self._http.close()
        self._raw.close()


def run_header(
    result: dict[str, Any], planned: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    return {
        "id": result["id"],
        "schema": result["schema"],
        "engine_version": result["engine_version"],
        "suite": result["suite"],
        "policy": result["policy"],
        "git": result["git"],
        "host": result["host"],
        "started_at": result["started_at"],
        "baseline": result.get("baseline"),
        "planned": planned
        or [
            {
                "key": c["key"],
                "label": c["label"],
                "scenario": c["scenario"],
                "episodes": c["episodes"],
            }
            for c in result["conditions"]
        ],
    }


def artifact_paths(condition: dict[str, Any]) -> list[str]:
    paths: list[str] = []
    for ep in condition["episodes_detail"]:
        if ep.get("trace"):
            paths.append(ep["trace"])
        if ep.get("video"):
            paths.append(ep["video"])
    return paths


def upload_result(client: Client, result: dict[str, Any], run_dir: Path) -> dict[str, Any]:
    """Upload a finished run in one go."""
    created = client.create_run(run_header(result))
    run_id = created["run_id"]
    for condition in result["conditions"]:
        client.add_condition(run_id, condition)
        client.upload_artifacts(run_id, run_dir, artifact_paths(condition))
    done = client.complete_run(
        run_id,
        {
            "finished_at": result["finished_at"],
            "duration_s": result["duration_s"],
            "verdict": result["verdict"],
            "summary": result["summary"],
        },
    )
    return {"run_id": run_id, "url": done.get("url") or created.get("url")}
