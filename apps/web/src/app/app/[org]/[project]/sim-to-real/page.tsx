import type { Metadata } from "next";

import { CodeBlock } from "@/components/code/code-block";
import { PageHeader } from "@/components/shell/shell";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { getConditions, getProjectContext, listRealTrials, listRuns } from "@/lib/data";
import { pct, points } from "@/lib/format";
import { mmrv, pearson, wilson } from "@/lib/stats";

export const metadata: Metadata = { title: "Sim to real" };

type Pair = {
  key: string;
  label: string;
  sim: number;
  simN: number;
  real: number;
  realN: number;
  realLow: number;
  realHigh: number;
};

function Scatter({ pairs }: { pairs: Pair[] }) {
  const size = 280;
  const pad = 32;
  const scale = (v: number) => pad + v * (size - pad * 2);
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Simulated success rate against real success rate, one point per condition. Points on the diagonal mean the simulator matched reality."
      className="w-full max-w-[320px]"
    >
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={scale(t)} x2={scale(t)} y1={scale(0)} y2={scale(1)} className="stroke-line-subtle" />
          <line x1={scale(0)} x2={scale(1)} y1={size - scale(t)} y2={size - scale(t)} className="stroke-line-subtle" />
          <text x={scale(t)} y={size - 12} textAnchor="middle" className="fill-fg-tertiary font-mono text-[9px]">
            {t * 100}
          </text>
          <text x={pad - 8} y={size - scale(t) + 3} textAnchor="end" className="fill-fg-tertiary font-mono text-[9px]">
            {t * 100}
          </text>
        </g>
      ))}
      <line
        x1={scale(0)}
        y1={size - scale(0)}
        x2={scale(1)}
        y2={size - scale(1)}
        className="stroke-line-strong"
        strokeDasharray="3 3"
      />
      {pairs.map((p) => (
        <g key={p.key}>
          <line
            x1={scale(p.sim)}
            x2={scale(p.sim)}
            y1={size - scale(p.realLow)}
            y2={size - scale(p.realHigh)}
            className="stroke-fg-tertiary"
          />
          <circle cx={scale(p.sim)} cy={size - scale(p.real)} r={4} className="fill-info stroke-base" strokeWidth={1.5}>
            <title>{`${p.label}: simulated ${pct(p.sim)}, real ${pct(p.real)} (${p.realN} trials)`}</title>
          </circle>
        </g>
      ))}
      <text x={size / 2} y={size - 1} textAnchor="middle" className="fill-fg-secondary text-[10px]">
        Simulated success %
      </text>
      <text
        x={9}
        y={size / 2}
        textAnchor="middle"
        transform={`rotate(-90 9 ${size / 2})`}
        className="fill-fg-secondary text-[10px]"
      >
        Real success %
      </text>
    </svg>
  );
}

export default async function SimToRealPage({
  params,
  searchParams,
}: PageProps<"/app/[org]/[project]/sim-to-real">) {
  const { org, project } = await params;
  const query = await searchParams;
  const ctx = await getProjectContext(org, project);
  const [trials, runs] = await Promise.all([
    listRealTrials(ctx.project.id),
    listRuns(ctx.project.id, {}, 200),
  ]);

  const command = [
    "# On the machine next to the robot: log each real trial as you run it.",
    "shakedown real record scenarios --policy-label v1 --robot so101 --trials 10",
    "",
    "# Compare with a simulated run, and upload both to this page.",
    "shakedown real correlate runs/<run> real-trials.jsonl --upload",
  ].join("\n");

  if (!trials.length) {
    return (
      <>
        <PageHeader
          title="Sim to real"
          description="A simulated result is only useful if it predicts what the real robot does. This page measures that."
        />
        <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-10 lg:px-6">
          <div>
            <h2 className="text-base font-semibold">No real-robot trials recorded yet</h2>
            <p className="mt-1 text-[13px] text-fg-secondary">
              Run a handful of the same conditions on a real arm and record whether each trial
              succeeded. Shakedown then reports how well simulated success rates track the real
              ones, per condition and overall. Until that is measured for your scene, treat
              simulated numbers as a relative signal between checkpoints, not as a forecast.
            </p>
          </div>
          <CodeBlock code={command} lang="bash" />
        </div>
      </>
    );
  }

  const policies = [...new Set(trials.map((t) => t.policy_label))];
  const policy =
    typeof query.policy === "string" && policies.includes(query.policy) ? query.policy : policies[0];
  const mine = trials.filter((t) => t.policy_label === policy);
  const suite = mine[0].suite;
  const run = runs.find(
    (r) => r.policy_label === policy && r.suite === suite && r.status === "completed",
  );
  const conditions = run ? await getConditions(run.id) : [];

  const grouped = new Map<string, { n: number; s: number }>();
  for (const t of mine) {
    const g = grouped.get(t.condition_key) ?? { n: 0, s: 0 };
    g.n += 1;
    if (t.success) g.s += 1;
    grouped.set(t.condition_key, g);
  }
  const pairs: Pair[] = [];
  for (const c of conditions) {
    const g = grouped.get(c.key);
    if (!g) continue;
    const [low, high] = wilson(g.s, g.n);
    pairs.push({
      key: c.key,
      label: c.label,
      sim: c.success_rate,
      simN: c.episodes,
      real: g.s / g.n,
      realN: g.n,
      realLow: low,
      realHigh: high,
    });
  }
  const r = pearson(pairs.map((p) => p.sim), pairs.map((p) => p.real));
  const violation = mmrv(pairs.map((p) => p.sim), pairs.map((p) => p.real));
  const enough = pairs.length >= 4;
  const verdict =
    !enough || r == null
      ? { text: "Not enough conditions to judge", tone: "text-fg-secondary" }
      : r >= 0.8
        ? { text: "Simulation tracks reality well here", tone: "text-pass" }
        : r >= 0.5
          ? { text: "Simulation tracks reality loosely", tone: "text-warn" }
          : { text: "Simulation does not predict reality here", tone: "text-fail" };

  return (
    <>
      <PageHeader
        title="Sim to real"
        description={
          <>
            {mine.length} real trials of <span className="font-mono">{policy}</span> across{" "}
            {grouped.size} conditions
            {run ? <>, against simulated run #{run.number}.</> : <>. No simulated run of this policy and suite was found.</>}
          </>
        }
      />
      <div className="grid gap-5 px-4 py-5 lg:px-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="flex flex-col gap-4 p-4">
          <div>
            <p className={cn("text-sm font-medium", verdict.tone)}>{verdict.text}</p>
            <p className="mt-1 text-xs text-fg-tertiary">
              Based on {pairs.length} condition{pairs.length === 1 ? "" : "s"} measured both ways.
              {enough ? "" : " At least four are needed for the correlation to mean anything."}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="label-caps">Pearson r</dt>
              <dd className="font-mono text-[28px] font-semibold leading-8 tabular">
                {r == null ? "–" : r.toFixed(2)}
              </dd>
              <dd className="text-xs text-fg-tertiary">1.0 is a perfect linear match</dd>
            </div>
            <div>
              <dt className="label-caps">Rank violation</dt>
              <dd className="font-mono text-[28px] font-semibold leading-8 tabular">
                {violation == null ? "–" : violation.toFixed(2)}
              </dd>
              <dd className="text-xs text-fg-tertiary">0 means conditions are never misordered</dd>
            </div>
          </dl>
          {pairs.length ? <Scatter pairs={pairs} /> : null}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="By condition"
            description="Vertical bars in the chart, and the interval here, show how uncertain the real rate is with this many trials."
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className="label-caps h-8 pl-4 pr-3 font-medium">Condition</th>
                  <th scope="col" className="label-caps px-3 text-right font-medium">Simulated</th>
                  <th scope="col" className="label-caps px-3 text-right font-medium">Real</th>
                  <th scope="col" className="label-caps px-3 text-right font-medium">Real interval</th>
                  <th scope="col" className="label-caps px-3 pr-4 text-right font-medium">Gap</th>
                </tr>
              </thead>
              <tbody>
                {[...pairs]
                  .sort((a, b) => Math.abs(b.real - b.sim) - Math.abs(a.real - a.sim))
                  .map((p) => {
                    const outside = p.sim < p.realLow || p.sim > p.realHigh;
                    return (
                      <tr key={p.key} className="border-b border-line-subtle last:border-0">
                        <td className="h-9 pl-4 pr-3 text-fg">{p.label}</td>
                        <td className="px-3 text-right font-mono tabular">
                          {pct(p.sim)} <span className="text-fg-tertiary">n={p.simN}</span>
                        </td>
                        <td className="px-3 text-right font-mono tabular">
                          {pct(p.real)} <span className="text-fg-tertiary">n={p.realN}</span>
                        </td>
                        <td className="px-3 text-right font-mono tabular text-fg-secondary">
                          {pct(p.realLow)}–{pct(p.realHigh)}
                        </td>
                        <td
                          className={cn(
                            "px-3 pr-4 text-right font-mono tabular",
                            outside ? "text-warn" : "text-fg-secondary",
                          )}
                          title={outside ? "The simulated rate is outside the real interval" : undefined}
                        >
                          {points(p.real - p.sim)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
