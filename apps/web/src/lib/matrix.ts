import "server-only";

import type { MatrixCell, MatrixData } from "@/components/matrix/types";
import type { Verdict } from "@/components/ui/status";
import {
  conditionChecks,
  getMatrix,
  projectSettings,
  runSummary,
  type Condition,
  type ProjectContext,
} from "@/lib/data";
import type { Outcomes } from "@/lib/stats";

const RANK: Record<Verdict, number> = { ERROR: 4, FAIL: 3, WARN: 2, PASS: 1, SKIP: 0 };

/** The check message that best explains a condition's verdict. */
export function headline(condition: Pick<Condition, "checks" | "error">): string {
  if (condition.error) return condition.error;
  const checks = [...conditionChecks(condition)].sort(
    (a, b) => RANK[b.verdict] - RANK[a.verdict],
  );
  return checks[0]?.message ?? "No assertions were defined for this condition.";
}

export function conditionPath(base: string, runNumber: number, key: string): string {
  return `${base}/runs/${runNumber}/${encodeURIComponent(key)}`;
}

export function toCell(condition: Condition, base: string, runNumber: number): MatrixCell {
  return {
    n: condition.episodes,
    successes: condition.successes,
    rate: condition.success_rate,
    ciLow: condition.ci_low,
    ciHigh: condition.ci_high,
    verdict: condition.verdict,
    fingerprint: condition.fingerprint,
    outcomes: (condition.outcomes ?? {}) as Outcomes,
    headline: headline(condition),
    href: conditionPath(base, runNumber, condition.key),
  };
}

export async function buildMatrix(ctx: ProjectContext, suite?: string) {
  const base = `/app/${ctx.org.slug}/${ctx.project.slug}`;
  const matrix = await getMatrix(ctx.project.id, suite);
  const settings = projectSettings(ctx.project);

  const cells: MatrixData["cells"] = {};
  for (const row of matrix.rows) cells[row.key] = {};
  for (const column of matrix.columns) {
    for (const [key, condition] of column.conditions) {
      cells[key][column.run.id] = toCell(condition, base, column.run.number);
    }
  }

  const data: MatrixData = {
    columns: matrix.columns.map(({ run, conditions }) => {
      const summary = runSummary(run);
      // While a run is in progress its summary is empty, so total what has arrived.
      const live = [...conditions.values()];
      const episodes = live.reduce((a, c) => a + c.episodes, 0);
      const successes = live.reduce((a, c) => a + c.successes, 0);
      return {
        id: run.id,
        number: run.number,
        label: run.policy_label,
        sha: run.git_sha,
        branch: run.git_branch,
        status: run.status,
        startedAt: run.started_at,
        rate: summary.episodes ? summary.success_rate : episodes ? successes / episodes : null,
        href: `${base}/runs/${run.number}`,
      };
    }),
    rows: matrix.rows.map((r) => ({
      key: r.key,
      scenario: r.scenario,
      label: r.label,
      description: r.description,
      tags: r.tags,
      sweepName: r.sweepName,
      sweepValue: r.sweepValue,
      perturbations: r.perturbations,
    })),
    cells,
    noiseThresholdPts: settings.noise_threshold_pts,
    minEpisodes: settings.min_episodes,
  };
  return { data, suites: matrix.suites, suite: matrix.suite };
}
