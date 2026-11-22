"""A log of trials run on a real robot.

Shakedown does not drive the robot. The operator sets up each condition,
runs the policy with their usual tooling, and records whether the trial
succeeded. The log is a JSON Lines file, one trial per line, so it can be
appended to safely and merged across sessions.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class Trial:
    suite: str
    condition_key: str
    policy_label: str
    trial: int
    success: bool
    robot: str = ""
    operator: str = ""
    notes: str = ""
    recorded_at: str = ""

    def __post_init__(self) -> None:
        if not self.recorded_at:
            self.recorded_at = datetime.now(timezone.utc).isoformat(timespec="seconds")


def read_trials(path: str | Path) -> list[Trial]:
    path = Path(path)
    if not path.exists():
        return []
    trials = []
    for number, line in enumerate(path.read_text().splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            trials.append(Trial(**json.loads(line)))
        except (ValueError, TypeError) as exc:
            raise ValueError(f"{path}:{number}: not a valid trial record: {exc}") from exc
    return trials


def append_trial(path: str | Path, trial: Trial) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as f:
        f.write(json.dumps(asdict(trial)) + "\n")
        f.flush()


def next_trial_number(trials: list[Trial], suite: str, key: str, policy: str) -> int:
    taken = [
        t.trial
        for t in trials
        if t.suite == suite and t.condition_key == key and t.policy_label == policy
    ]
    return max(taken, default=-1) + 1
