import { describe, expect, it } from "vitest";

import { fieldGate, fisherLower, passes, testGate, type RunEvidence } from "./gates";
import { coverage, quantile, suggest, type FieldRow } from "./suggest";

const settings = { min_episodes: 20, min_field_episodes: 30, max_field_drop_pts: 10 };

function rows(n: number, make: (i: number) => Partial<FieldRow>): FieldRow[] {
  return Array.from({ length: n }, (_, i) => ({
    success: true,
    steps: 300,
    measured: {},
    ...make(i),
  }));
}

describe("coverage", () => {
  it("reads the range a suite already tests", () => {
    const c = coverage([
      { env: "aloha/transfer_cube", perturbations: [] },
      { env: "aloha/transfer_cube", perturbations: [{ action_latency: { steps: 5 } }] },
      { env: "aloha/transfer_cube", perturbations: [{ lighting: { intensity: 0.4 } }] },
      { env: "aloha/transfer_cube", perturbations: [{ frame_drop: { probability: 0.1 } }] },
    ]);
    expect(c).toMatchObject({ maxLatencySteps: 5, minBrightness: 0.4, maxFrameDrop: 0.1 });
  });
});

describe("suggest", () => {
  const covered = coverage([
    { env: "aloha/transfer_cube", perturbations: [{ action_latency: { steps: 5 } }] },
  ]);

  it("proposes a delay test when robots are slower than the suite assumes", () => {
    const out = suggest(
      rows(20, (i) => ({ measured: { action_delay_ms: 150 + i * 4, control_hz: 50 } })),
      covered,
    );
    expect(out).toHaveLength(1);
    expect(out[0].yaml).toContain("action_latency");
    expect(out[0].yaml).toContain("env: aloha/transfer_cube");
    expect(out[0].evidence.p90_ms).toBeGreaterThan(200);
    expect(out[0].yaml).toMatch(/values: \[\d+, \d+\]/);
  });

  it("stays silent when the suite already covers the field", () => {
    const out = suggest(rows(20, () => ({ measured: { action_delay_ms: 60, control_hz: 50 } })), covered);
    expect(out).toEqual([]);
  });

  it("needs enough reports before proposing anything", () => {
    expect(suggest(rows(5, () => ({ measured: { action_delay_ms: 400 } })), covered)).toEqual([]);
  });

  it("proposes an exposure test when failures are darker, and says it is an association", () => {
    const data = [
      ...rows(12, () => ({ success: true, measured: { image_brightness: 120 } })),
      ...rows(12, () => ({ success: false, measured: { image_brightness: 70 } })),
    ];
    const [s] = suggest(data, covered);
    expect(s.yaml).toContain("image_adjust: { brightness: 0.58 }");
    expect(s.rationale).toContain("association");
  });

  it("proposes a dropped-frame test", () => {
    const [s] = suggest(rows(15, () => ({ steps: 200, measured: { frames_dropped: 30 } })), covered);
    expect(s.yaml).toContain("frame_drop: { probability: 0.15 }");
  });

  it("computes quantiles by interpolation", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([10], 0.9)).toBe(10);
  });
});

describe("gates", () => {
  const clean: NonNullable<RunEvidence> = {
    status: "completed",
    verdict: "PASS",
    hasBaseline: true,
    conditions: [{ key: "nominal", verdict: "PASS", episodes: 50, regression: false }],
  };

  it("lets a clean run through", () => {
    expect(passes(testGate(clean, settings))).toBe(true);
  });

  it("stops a release with no run, a failure, a regression or too few episodes", () => {
    expect(passes(testGate(null, settings))).toBe(false);
    const withCondition = (c: Partial<(typeof clean.conditions)[number]>) => ({
      ...clean,
      conditions: [{ ...clean.conditions[0], ...c }],
    });
    expect(passes(testGate(withCondition({ verdict: "FAIL" }), settings))).toBe(false);
    expect(passes(testGate(withCondition({ regression: true }), settings))).toBe(false);
    expect(passes(testGate(withCondition({ episodes: 5 }), settings))).toBe(false);
    expect(passes(testGate(withCondition({ verdict: "WARN" }), settings))).toBe(true);
  });

  it("needs field evidence before the fleet", () => {
    const few = fieldGate({ episodes: 10, successes: 9, interventions: 0 }, null, settings);
    expect(passes(few)).toBe(false);
    const enough = fieldGate({ episodes: 40, successes: 34, interventions: 2 }, null, settings);
    expect(passes(enough)).toBe(true);
  });

  it("stops a canary that is clearly worse than the fleet, and only then", () => {
    const fleet = { episodes: 200, successes: 180, interventions: 5, label: "v1" };
    const worse = fieldGate({ episodes: 40, successes: 24, interventions: 9 }, fleet, settings);
    expect(passes(worse)).toBe(false);
    // Six points lower over 40 episodes is within what chance produces.
    const noisy = fieldGate({ episodes: 40, successes: 34, interventions: 1 }, fleet, settings);
    expect(passes(noisy)).toBe(true);
  });

  it("computes a one-sided Fisher test", () => {
    expect(fisherLower(5, 10, 5, 10)).toBeGreaterThan(0.5);
    expect(fisherLower(1, 10, 9, 10)).toBeLessThan(0.01);
  });
});
