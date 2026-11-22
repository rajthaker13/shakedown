import type { Verdict } from "@/components/ui/status";
import { wilson } from "@/lib/stats";

/**
 * Gates decide whether a release may move to the next stage. They are pure
 * functions of the evidence, so the same evidence always gives the same
 * answer and the answer can be stored with the decision.
 */
export type GateCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export type GateSettings = {
  min_episodes: number;
  min_field_episodes: number;
  max_field_drop_pts: number;
};

export type RunEvidence = {
  status: string;
  verdict: Verdict | null;
  conditions: { key: string; verdict: Verdict; episodes: number; regression: boolean }[];
  hasBaseline: boolean;
} | null;

export type FieldEvidence = { episodes: number; successes: number; interventions: number };

function logChoose(n: number, k: number): number {
  let out = 0;
  for (let i = 1; i <= k; i++) out += Math.log(n - k + i) - Math.log(i);
  return out;
}

/** One-sided Fisher exact: the chance of seeing this few successes if the two rates were equal. */
export function fisherLower(s1: number, n1: number, s2: number, n2: number): number {
  if (n1 === 0 || n2 === 0) return 1;
  const total = s1 + s2;
  const denom = logChoose(n1 + n2, total);
  let p = 0;
  for (let a = Math.max(0, total - n2); a <= s1; a++) {
    p += Math.exp(logChoose(n1, a) + logChoose(n2, total - a) - denom);
  }
  return Math.min(1, p);
}

/** Candidate to canary: the release must rest on a clean test run. */
export function testGate(run: RunEvidence, settings: GateSettings): GateCheck[] {
  if (!run) {
    return [
      {
        id: "run",
        label: "Backed by a test run",
        ok: false,
        detail: "This release is not linked to a run, so nothing shows how it behaves.",
      },
    ];
  }
  const failed = run.conditions.filter((c) => c.verdict === "FAIL" || c.verdict === "ERROR");
  const regressed = run.conditions.filter((c) => c.regression);
  const thin = run.conditions.filter((c) => c.episodes < settings.min_episodes);
  return [
    {
      id: "run",
      label: "Backed by a completed test run",
      ok: run.status === "completed" && run.conditions.length > 0,
      detail:
        run.status === "completed"
          ? `${run.conditions.length} conditions were tested.`
          : `The run is ${run.status}.`,
    },
    {
      id: "failures",
      label: "No condition failed",
      ok: failed.length === 0,
      detail: failed.length
        ? `Failed: ${failed.map((c) => c.key).join(", ")}.`
        : "Every condition met its assertions or was inconclusive.",
    },
    {
      id: "regressions",
      label: "No regression against the baseline",
      ok: regressed.length === 0,
      detail: !run.hasBaseline
        ? "The run had no baseline, so regressions could not be checked."
        : regressed.length
          ? `Regressed: ${regressed.map((c) => c.key).join(", ")}.`
          : "No condition dropped with statistical support.",
    },
    {
      id: "sample",
      label: `At least ${settings.min_episodes} episodes per condition`,
      ok: thin.length === 0,
      detail: thin.length
        ? `${thin.length} condition(s) have fewer, so their rates are too uncertain to rely on.`
        : "Every condition has enough episodes.",
    },
  ];
}

/** Canary to fleet: the release must have held up on real robots. */
export function fieldGate(
  canary: FieldEvidence,
  fleet: (FieldEvidence & { label: string }) | null,
  settings: GateSettings,
): GateCheck[] {
  const rate = canary.episodes ? canary.successes / canary.episodes : 0;
  const [low, high] = wilson(canary.successes, canary.episodes);
  const checks: GateCheck[] = [
    {
      id: "evidence",
      label: `At least ${settings.min_field_episodes} field episodes as a canary`,
      ok: canary.episodes >= settings.min_field_episodes,
      detail: `${canary.episodes} reported so far${
        canary.episodes
          ? `: ${Math.round(rate * 100)}% succeeded (95% interval ${Math.round(low * 100)} to ${Math.round(high * 100)}).`
          : "."
      }`,
    },
  ];
  if (fleet && fleet.episodes > 0) {
    const fleetRate = fleet.successes / fleet.episodes;
    const drop = (fleetRate - rate) * 100;
    const p = fisherLower(canary.successes, canary.episodes, fleet.successes, fleet.episodes);
    const worse = drop > settings.max_field_drop_pts && p < 0.05;
    checks.push({
      id: "field-regression",
      label: `Not worse than the fleet release by more than ${settings.max_field_drop_pts} points`,
      ok: !worse,
      detail: `Canary ${Math.round(rate * 100)}% over ${canary.episodes}, fleet (${fleet.label}) ${Math.round(
        fleetRate * 100,
      )}% over ${fleet.episodes}${worse ? `, p = ${p.toFixed(3)}` : ""}.`,
    });
  } else {
    checks.push({
      id: "field-regression",
      label: "Compared with the current fleet release",
      ok: true,
      detail: "There is no fleet release with field reports to compare with.",
    });
  }
  return checks;
}

export function passes(checks: GateCheck[]): boolean {
  return checks.every((c) => c.ok);
}
