import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CodeBlock } from "@/components/code/code-block";
import { RateBar } from "@/components/run-bits";
import { PageHeader } from "@/components/shell/shell";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge, StatusIcon, statusMeta } from "@/components/ui/status";
import { cn } from "@/lib/cn";
import {
  conditionChecks,
  getConditions,
  getEpisodes,
  getProjectContext,
  getRun,
} from "@/lib/data";
import { pct, points, pValue } from "@/lib/format";

type Props = PageProps<"/app/[org]/[project]/runs/[number]/[condition]">;
type Comparison = {
  baseline?: string;
  paired?: boolean;
  baseline_rate?: number;
  candidate_rate?: number;
  delta?: number;
  p_value?: number;
  regressed_seeds?: number;
  improved_seeds?: number;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { number, condition } = await params;
  return { title: `${decodeURIComponent(condition)} · Run #${number}` };
}

export default async function ConditionPage({ params }: Props) {
  const { org, project, number, condition: rawKey } = await params;
  const key = decodeURIComponent(rawKey);
  const ctx = await getProjectContext(org, project);
  const base = `/app/${ctx.org.slug}/${ctx.project.slug}`;
  const run = await getRun(ctx.project.id, Number(number));
  const conditions = await getConditions(run.id);
  const condition = conditions.find((c) => c.key === key);
  if (!condition) notFound();
  const episodes = await getEpisodes(condition.id);

  const checks = conditionChecks(condition);
  const cmp = condition.comparison as Comparison | null;
  const labels = Object.entries((condition.failure_labels ?? {}) as Record<string, number>).sort(
    (a, b) => b[1] - a[1],
  );
  const failures = condition.episodes - condition.successes;
  const contacts = Object.entries((condition.contacts ?? {}) as Record<string, number>).sort(
    (a, b) => b[1] - a[1],
  );
  const min = checks.find((c) => c.name === "success_rate")?.detail?.min;
  const self = `${base}/runs/${run.number}/${encodeURIComponent(condition.key)}`;

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Runs", href: `${base}/runs` },
          { label: `#${run.number}`, href: `${base}/runs/${run.number}` },
          { label: condition.label },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {condition.label}
            <StatusBadge status={condition.verdict} />
          </span>
        }
        description={condition.description || undefined}
        meta={
          <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-fg-secondary">
            <span>{run.policy_label}</span>
            <span className="text-fg-tertiary">{condition.env}</span>
            <span className="text-fg-tertiary">{condition.backend}</span>
            {condition.perturbation_summary.map((p) => (
              <span key={p}>{p}</span>
            ))}
          </p>
        }
      />

      <div className="grid gap-5 px-4 py-5 lg:px-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <div className="flex flex-wrap items-center gap-x-10 gap-y-4 px-4 py-4">
              <div>
                <div className="label-caps">Success rate</div>
                <div className="font-mono text-[28px] font-semibold leading-8 tracking-[-0.02em] tabular">
                  {pct(condition.success_rate)}
                </div>
                <div className="text-xs text-fg-tertiary">
                  {condition.successes} of {condition.episodes} episodes
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="label-caps">95% interval</div>
                <RateBar
                  rate={condition.success_rate}
                  low={condition.ci_low}
                  high={condition.ci_high}
                  threshold={typeof min === "number" ? min : null}
                />
                <div className="font-mono text-xs tabular text-fg-secondary">
                  {pct(condition.ci_low)} to {pct(condition.ci_high)}
                </div>
              </div>
              {cmp?.delta != null ? (
                <div>
                  <div className="label-caps">
                    Against <span className="font-mono normal-case tracking-normal">{cmp.baseline}</span>
                  </div>
                  <div
                    className={cn(
                      "font-mono text-[28px] font-semibold leading-8 tracking-[-0.02em] tabular",
                      cmp.delta < -0.005 ? "text-fail" : cmp.delta > 0.005 ? "text-info" : "text-fg",
                    )}
                  >
                    {points(cmp.delta)}
                  </div>
                  <div className="text-xs text-fg-tertiary">
                    {pct(cmp.baseline_rate)} to {pct(cmp.candidate_rate)} · p {pValue(cmp.p_value)}
                    {cmp.paired
                      ? ` · ${cmp.regressed_seeds} seeds broke, ${cmp.improved_seeds} fixed`
                      : " · unpaired"}
                  </div>
                </div>
              ) : null}
              {condition.mean_steps_success != null ? (
                <div>
                  <div className="label-caps">Mean steps to succeed</div>
                  <div className="font-mono text-[28px] font-semibold leading-8 tracking-[-0.02em] tabular">
                    {Math.round(condition.mean_steps_success)}
                  </div>
                </div>
              ) : null}
            </div>
            <ul className="border-t border-line-subtle">
              {checks.length === 0 ? (
                <li className="px-4 py-3 text-[13px] text-fg-secondary">
                  This scenario defines no assertions, so there is nothing to pass or fail.
                </li>
              ) : null}
              {checks.map((check) => (
                <li
                  key={check.name}
                  className="flex items-start gap-2.5 border-b border-line-subtle px-4 py-2.5 last:border-0"
                >
                  <StatusIcon status={check.verdict} className="mt-0.5" />
                  <div className="min-w-0 text-[13px]">
                    <span className="font-mono text-xs text-fg-tertiary">{check.name}</span>
                    <span className="sr-only"> {statusMeta[check.verdict].label}</span>
                    <p className="text-fg">{check.message}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {labels.length ? (
            <Card>
              <CardHeader
                title="How it failed"
                description={`${failures} failed episode${failures === 1 ? "" : "s"}, grouped by how far each got.`}
              />
              <ul className="flex flex-col gap-2.5 px-4 py-3">
                {labels.map(([label, count]) => (
                  <li key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1">
                    <span className="text-[13px] text-fg">{label}</span>
                    <span className="font-mono text-xs tabular text-fg-secondary">
                      {count} · {pct(count / Math.max(1, failures))}
                    </span>
                    <span className="col-span-2 h-1 overflow-hidden rounded-full bg-raised">
                      <span
                        className="block h-full rounded-full bg-fail-solid"
                        style={{ width: `${(count / Math.max(1, failures)) * 100}%` }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card className="overflow-hidden">
            <CardHeader
              title="Episodes"
              description="Failures first. Each episode is one seeded rollout."
            />
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full min-w-[640px] border-collapse text-[13px]">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-line text-left">
                    <th scope="col" className="label-caps h-8 pl-4 pr-3 font-medium">Seed</th>
                    <th scope="col" className="label-caps px-3 text-right font-medium">Steps</th>
                    <th scope="col" className="label-caps px-3 text-right font-medium">Diverged</th>
                    <th scope="col" className="label-caps px-3 font-medium">Outcome</th>
                    <th scope="col" className="label-caps px-3 pr-4 text-right font-medium">Replay</th>
                  </tr>
                </thead>
                <tbody>
                  {episodes.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-line-subtle transition-colors duration-100 last:border-0 hover:bg-raised"
                    >
                      <td className="h-9 pl-4 pr-3">
                        <Link href={`${self}/${e.seed}`} className="flex items-center gap-2 font-mono tabular text-fg">
                          <StatusIcon status={e.error ? "ERROR" : e.success ? "PASS" : "FAIL"} />
                          {e.seed}
                        </Link>
                      </td>
                      <td className="px-3 text-right font-mono tabular text-fg-secondary">{e.steps}</td>
                      <td className="px-3 text-right font-mono tabular text-fg-secondary">
                        {e.first_divergence_step ?? "–"}
                      </td>
                      <td className="max-w-sm px-3 text-fg-secondary">
                        {e.error ? (
                          <span className="text-fail">{e.error.split("\n")[0]}</span>
                        ) : e.success ? (
                          "Succeeded"
                        ) : (
                          <>
                            {e.failure_label}
                            {e.nominal_success === false ? (
                              <span className="text-fg-tertiary">
                                {" "}
                                · also fails without perturbation
                              </span>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td className="px-3 pr-4 text-right">
                        <Link
                          href={`${self}/${e.seed}`}
                          className="text-accent underline-offset-4 hover:underline"
                        >
                          {e.video_path ? "Video" : "Signals"}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {contacts.length ? (
            <Card>
              <CardHeader title="Contacts" description="Episodes in which each kind of contact occurred." />
              <ul className="px-4 py-2">
                {contacts.map(([group, count]) => (
                  <li key={group} className="flex items-center justify-between py-1 text-[13px]">
                    <span className="font-mono text-xs text-fg-secondary">{group.replace(":", " ↔ ")}</span>
                    <span className="font-mono text-xs tabular text-fg">
                      {count}/{condition.episodes}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {condition.scenario_source ? (
            <div>
              <h2 className="label-caps mb-2">Scenario file</h2>
              <CodeBlock
                code={condition.scenario_source}
                lang="yaml"
                filename={`${condition.scenario}.yaml`}
                lineNumbers
              />
              <p className="mt-2 font-mono text-[11px] text-fg-tertiary">
                fingerprint {condition.fingerprint}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
