import json
import xml.etree.ElementTree as ET

from shakedown.real.correlate import correlate
from shakedown.real.trials import Trial, append_trial, next_trial_number, read_trials
from shakedown.report import to_junit, to_markdown


def result(rates):
    conditions = []
    for key, rate in rates.items():
        conditions.append(
            {
                "key": key,
                "scenario": key,
                "label": key,
                "success_rate": rate,
                "episodes": 50,
                "successes": round(rate * 50),
                "ci_low": max(0, rate - 0.1),
                "ci_high": min(1, rate + 0.1),
                "verdict": "PASS" if rate > 0.5 else "FAIL",
                "duration_s": 1.0,
                "error": None,
                "comparison": None,
                "checks": [
                    {
                        "name": "success_rate",
                        "verdict": "PASS" if rate > 0.5 else "FAIL",
                        "message": "m",
                        "detail": {},
                    }
                ],
            }
        )
    fails = sum(1 for c in conditions if c["verdict"] == "FAIL")
    return {
        "id": "r",
        "suite": "s",
        "policy": {"label": "v1"},
        "baseline": None,
        "started_at": "2026-01-01T00:00:00+00:00",
        "duration_s": 3.0,
        "verdict": "FAIL" if fails else "PASS",
        "summary": {
            "conditions": len(conditions),
            "pass": len(conditions) - fails,
            "warn": 0,
            "fail": fails,
            "skip": 0,
            "error": 0,
            "regressions": 0,
            "episodes": 1,
            "successes": 1,
            "success_rate": 1.0,
        },
        "conditions": conditions,
    }


def trials(per_condition, policy="v1"):
    out = []
    for key, (successes, n) in per_condition.items():
        for i in range(n):
            out.append(Trial("s", key, policy, i, i < successes))
    return out


def test_trial_log_round_trips(tmp_path):
    path = tmp_path / "t.jsonl"
    append_trial(path, Trial("s", "a", "v1", 0, True, robot="so101"))
    append_trial(path, Trial("s", "a", "v1", 1, False, notes="dropped it"))
    log = read_trials(path)
    assert [t.success for t in log] == [True, False]
    assert log[1].notes == "dropped it" and log[0].recorded_at
    assert next_trial_number(log, "s", "a", "v1") == 2
    assert next_trial_number(log, "s", "b", "v1") == 0


def test_correlation_when_simulation_tracks_reality():
    sim = {"a": 0.9, "b": 0.7, "c": 0.5, "d": 0.2}
    c = correlate(result(sim), trials({"a": (9, 10), "b": (7, 10), "c": (4, 10), "d": (2, 10)}))
    assert len(c.pairs) == 4 and c.enough
    assert c.pearson > 0.95 and c.mmrv == 0
    assert "tracks reality well" in c.summary


def test_correlation_when_simulation_is_wrong():
    sim = {"a": 0.9, "b": 0.7, "c": 0.5, "d": 0.2}
    c = correlate(result(sim), trials({"a": (1, 10), "b": (4, 10), "c": (6, 10), "d": (9, 10)}))
    assert c.pearson < 0 and c.mmrv > 0.3
    assert "does not predict" in c.summary


def test_correlation_will_not_judge_on_a_handful_of_trials():
    sim = {"a": 0.9, "b": 0.7, "c": 0.5, "d": 0.2}
    c = correlate(result(sim), trials({"a": (3, 3), "b": (2, 3), "c": (1, 3), "d": (0, 3)}))
    assert len(c.thin) == 4
    assert "fewer than 5 real trials" in c.summary


def test_correlation_ignores_other_suites_and_robots():
    sim = {"a": 0.9, "b": 0.2}
    log = trials({"a": (9, 10), "b": (2, 10)})
    for t in log[:10]:
        t.suite = "another-suite"
    for t in log[10:15]:
        t.robot = "arm-2"
    assert [p.key for p in correlate(result(sim), log).pairs] == ["b"]
    (only,) = correlate(result(sim), log, robot="arm-2").pairs
    assert only.real_n == 5


def test_correlation_needs_enough_conditions_and_the_right_policy():
    sim = {"a": 0.9, "b": 0.2}
    few = correlate(result(sim), trials({"a": (9, 10), "b": (2, 10)}))
    assert not few.enough and "at least 4" in few.summary
    other = correlate(result(sim), trials({"a": (9, 10)}, policy="v2"))
    assert other.pairs == [] and other.pearson is None


def test_junit_is_well_formed():
    root = ET.fromstring(to_junit(result({"a": 0.9, "b": 0.2})))
    assert root.tag == "testsuite" and root.get("tests") == "2" and root.get("failures") == "1"
    cases = root.findall("testcase")
    assert len(cases) == 2 and cases[1].find("failure") is not None


def test_markdown_has_a_row_per_condition_and_no_emoji():
    text = to_markdown(result({"a": 0.9, "b": 0.2}), url="http://x/runs/1")
    assert text.count("\n| ") >= 3 and "http://x/runs/1" in text
    assert all(ord(ch) < 0x2600 or ch in "–·" for ch in text)
    json.dumps(text)
