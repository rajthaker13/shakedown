import { describe, expect, it } from "vitest";

import { classify, compare, mmrv, pearson, wilson, type Outcomes } from "./stats";

/**
 * The dashboard and the engine must reach the same numbers. The expected
 * values here are the ones asserted in engine/tests/test_stats.py.
 */
function outcomes(successes: number, n: number): Outcomes {
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [String(1000 + i), i < successes]));
}

describe("wilson", () => {
  it("matches the engine", () => {
    const [low, high] = wilson(38, 50);
    expect(low).toBeCloseTo(0.6258, 3);
    expect(high).toBeCloseTo(0.8566, 3);
  });
  it("stays in range at the extremes", () => {
    expect(wilson(0, 20)[0]).toBe(0);
    expect(wilson(20, 20)[1]).toBe(1);
    expect(wilson(0, 0)).toEqual([0, 1]);
  });
});

describe("compare", () => {
  it("uses exact McNemar on paired outcomes", () => {
    const base = { ...outcomes(10, 20) };
    const head = { ...outcomes(4, 20) };
    const c = compare(base, head, true);
    expect(c.paired).toBe(true);
    expect(c.regressed).toHaveLength(6);
    expect(c.improved).toHaveLength(0);
    expect(c.pValue).toBeCloseTo(2 * 0.5 ** 6, 10);
    expect(c.delta).toBeCloseTo(-0.3, 10);
  });
  it("reports no evidence when nothing changed", () => {
    expect(compare(outcomes(7, 10), outcomes(7, 10), true).pValue).toBe(1);
  });
  it("falls back to Fisher when fingerprints differ", () => {
    const c = compare(outcomes(8, 10), outcomes(1, 6), false);
    expect(c.paired).toBe(false);
    expect(c.pValue).toBeCloseTo(0.035, 3);
    expect(c.regressed).toEqual([]);
  });
  it("is unpaired when the seeds differ, even with equal fingerprints", () => {
    const head = Object.fromEntries(Object.entries(outcomes(5, 10)).map(([k, v]) => [`9${k}`, v]));
    expect(compare(outcomes(5, 10), head, true).paired).toBe(false);
  });
});

describe("classify", () => {
  it("separates a clear regression from a possible one", () => {
    expect(classify(compare(outcomes(45, 50), outcomes(25, 50), true))).toBe("regression");
    expect(classify(compare(outcomes(40, 50), outcomes(36, 50), true))).toBe("suspect");
    expect(classify(compare(outcomes(40, 50), outcomes(39, 50), true))).toBe("unchanged");
    expect(classify(compare(outcomes(20, 50), outcomes(45, 50), true))).toBe("improvement");
  });
  it("respects the noise threshold", () => {
    const c = compare(outcomes(45, 50), outcomes(38, 50), true);
    expect(classify(c, 0.05)).toBe("regression");
    expect(classify(c, 0.2)).toBe("unchanged");
  });
});

describe("correlation", () => {
  it("matches the engine", () => {
    expect(pearson([0.1, 0.5, 0.9], [0.2, 0.6, 1.0])).toBeCloseTo(1, 10);
    expect(pearson([0.5, 0.5], [0.1, 0.9])).toBeNull();
    expect(mmrv([0.2, 0.5, 0.9], [0.1, 0.4, 0.8])).toBe(0);
    expect(mmrv([0.8, 0.6], [0.3, 0.7])).toBeCloseTo(0.4, 10);
  });
});
