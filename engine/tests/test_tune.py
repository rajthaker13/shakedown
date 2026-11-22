from shakedown.tune import recommend


def result(label, rates, n=50, sweep=None):
    """A result with one condition per entry in `rates`, succeeding on the first seeds."""
    conditions = []
    for key, rate in rates.items():
        wins = round(rate * n)
        value = sweep.get(key) if sweep else None
        conditions.append(
            {
                "key": key,
                "label": key,
                "scenario": key.split("@")[0],
                "fingerprint": key,
                "episodes": n,
                "successes": wins,
                "success_rate": wins / n,
                "perturbations": [] if key == "nominal" else [{"x": {}}],
                "sweep_name": "steps" if value is not None else None,
                "sweep_value": value,
                "outcomes": {str(1000 + i): i < wins for i in range(n)},
            }
        )
    return {"policy": {"label": label, "spec": f"lerobot:m?{label}"}, "conditions": conditions}


def test_a_clearly_better_setting_is_chosen():
    r = recommend(
        [
            result("a", {"nominal": 0.8, "delay": 0.7}),
            result("b", {"nominal": 0.8, "delay": 0.2}),
        ]
    )
    assert r.chosen.label == "a" and r.clear
    assert r.p_values["b"] < 0.05
    assert [c.label for c in r.ranked] == ["a", "b"]


def test_indistinguishable_settings_keep_the_default():
    r = recommend(
        [
            result("tuned", {"nominal": 0.80, "delay": 0.72}),
            result("default", {"nominal": 0.78, "delay": 0.70}),
        ],
        default_label="default",
    )
    assert not r.clear
    assert r.chosen.label == "default"
    assert "no evidence for changing" in r.reason


def test_without_a_default_the_best_worst_case_wins_a_tie():
    r = recommend(
        [
            result("a", {"nominal": 0.90, "delay": 0.50}),
            result("b", {"nominal": 0.74, "delay": 0.64}),
        ]
    )
    assert not r.clear
    assert r.chosen.label == "b"
    assert "worst case" in r.reason


def test_tolerance_names_where_it_breaks():
    rates = {"nominal": 0.8, "latency@2": 0.78, "latency@5": 0.76, "latency@10": 0.2}
    sweep = {"latency@2": 2, "latency@5": 5, "latency@10": 10}
    r = recommend([result("a", rates, sweep=sweep)])
    (line,) = r.tolerance
    assert "holds up to steps=5" in line and "steps=10" in line


def test_tolerance_when_nothing_breaks():
    rates = {"nominal": 0.8, "latency@2": 0.8, "latency@5": 0.78}
    r = recommend([result("a", rates, sweep={"latency@2": 2, "latency@5": 5})])
    assert "no clear drop up to steps=5" in r.tolerance[0]


def test_json_is_complete():
    data = recommend([result("a", {"nominal": 0.8}), result("b", {"nominal": 0.4})]).to_json()
    assert data["chosen"]["label"] == "a"
    assert {row["label"] for row in data["ranked"]} == {"a", "b"}
    assert data["ranked"][0]["p_vs_best"] is None
