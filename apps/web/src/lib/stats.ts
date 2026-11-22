/**
 * The same statistics the engine uses, so the dashboard can compare any two
 * runs on the fly and reach the verdict the CLI would.
 */

const Z: Record<string, number> = { "0.8": 1.2815515655, "0.9": 1.644853627, "0.95": 1.9599639845, "0.99": 2.5758293035 };

export function wilson(successes: number, n: number, confidence = 0.95): [number, number] {
  if (n <= 0) return [0, 1];
  const z = Z[String(confidence)] ?? Z["0.95"];
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [
    successes === 0 ? 0 : Math.max(0, center - half),
    successes === n ? 1 : Math.min(1, center + half),
  ];
}

function logChoose(n: number, k: number): number {
  let out = 0;
  for (let i = 1; i <= k; i++) out += Math.log(n - k + i) - Math.log(i);
  return out;
}

/** Exact two-sided binomial test of k in n against p = 0.5. */
function binomTwoSided(k: number, n: number): number {
  if (n === 0) return 1;
  let tail = 0;
  const limit = Math.min(k, n - k);
  for (let i = 0; i <= limit; i++) tail += Math.exp(logChoose(n, i) - n * Math.LN2);
  return Math.min(1, 2 * tail);
}

export type Comparison = {
  n: number;
  paired: boolean;
  baseRate: number;
  headRate: number;
  /** Head minus base, as a fraction. */
  delta: number;
  /** Seeds the base solved and the head did not. */
  regressed: number[];
  /** Seeds the head solved and the base did not. */
  improved: number[];
  pValue: number;
};

export type Outcomes = Record<string, boolean>;

function fisher(s1: number, n1: number, s2: number, n2: number): number {
  if (n1 === 0 || n2 === 0) return 1;
  const total = s1 + s2;
  const denom = logChoose(n1 + n2, total);
  const prob = (a: number) => Math.exp(logChoose(n1, a) + logChoose(n2, total - a) - denom);
  const observed = prob(s1);
  let p = 0;
  for (let a = Math.max(0, total - n2); a <= Math.min(n1, total); a++) {
    const v = prob(a);
    if (v <= observed * (1 + 1e-9)) p += v;
  }
  return Math.min(1, p);
}

/**
 * Compare two sets of outcomes. When both cover the same seeds under the same
 * conditions the comparison is paired (exact McNemar), which is far more
 * sensitive than comparing two independent rates.
 */
export function compare(
  base: Outcomes,
  head: Outcomes,
  sameFingerprint: boolean,
): Comparison {
  const baseSeeds = Object.keys(base);
  const headSeeds = Object.keys(head);
  const shared = headSeeds.filter((s) => s in base);
  const paired =
    sameFingerprint && shared.length === headSeeds.length && shared.length === baseSeeds.length;
  const baseWins = baseSeeds.filter((s) => base[s]).length;
  const headWins = headSeeds.filter((s) => head[s]).length;
  const baseRate = baseSeeds.length ? baseWins / baseSeeds.length : 0;
  const headRate = headSeeds.length ? headWins / headSeeds.length : 0;

  if (!paired) {
    return {
      n: headSeeds.length,
      paired,
      baseRate,
      headRate,
      delta: headRate - baseRate,
      regressed: [],
      improved: [],
      pValue: fisher(baseWins, baseSeeds.length, headWins, headSeeds.length),
    };
  }
  const regressed = shared.filter((s) => base[s] && !head[s]).map(Number).sort((a, b) => a - b);
  const improved = shared.filter((s) => !base[s] && head[s]).map(Number).sort((a, b) => a - b);
  return {
    n: shared.length,
    paired,
    baseRate,
    headRate,
    delta: headRate - baseRate,
    regressed,
    improved,
    pValue: binomTwoSided(
      Math.min(regressed.length, improved.length),
      regressed.length + improved.length,
    ),
  };
}

export type DeltaClass = "regression" | "suspect" | "unchanged" | "improvement";

/**
 * Classify a change the way the engine's regression check does: a drop only
 * counts as a regression when it exceeds the allowed drop and is statistically
 * clear. A drop that is large but not clear is a suspect, not a failure.
 */
export function classify(c: Comparison, maxDrop = 0.05, confidence = 0.95): DeltaClass {
  const drop = -c.delta;
  if (drop > maxDrop) return c.pValue < 1 - confidence ? "regression" : "suspect";
  if (c.delta > maxDrop && c.pValue < 1 - confidence) return "improvement";
  return "unchanged";
}

export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n !== ys.length || n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** Mean maximum rank violation between simulated and real success rates. */
export function mmrv(sim: number[], real: number[]): number | null {
  const n = sim.length;
  if (n !== real.length || n === 0) return null;
  let total = 0;
  for (let i = 0; i < n; i++) {
    let worst = 0;
    for (let j = 0; j < n; j++) {
      if (i !== j && sim[i] < sim[j] !== real[i] < real[j]) {
        worst = Math.max(worst, Math.abs(real[i] - real[j]));
      }
    }
    total += worst;
  }
  return total / n;
}
