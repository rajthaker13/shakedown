import type { Metadata } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/action-form";
import { CloudCollector } from "@/components/cloud-collector";
import { CodeBlock } from "@/components/code/code-block";
import { LiveRefresh } from "@/components/live-refresh";
import { GitRef, RateBar, runStatus } from "@/components/run-bits";
import { PageHeader } from "@/components/shell/shell";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge, StatusIcon, statusMeta } from "@/components/ui/status";
import { cn } from "@/lib/cn";
import {
  conditionChecks,
  getConditions,
  getProjectContext,
  getRun,
  getRunById,
  plannedConditions,
  runSummary,
  type Condition,
} from "@/lib/data";
import { absoluteTime, duration, pct, points } from "@/lib/format";
import { conditionPath, headline } from "@/lib/matrix";
import { createClient } from "@/lib/supabase/server";

import { createRelease, deleteRun } from "../../../../actions";

export async function generateMetadata({
  params,
}: PageProps<"/app/[org]/[project]/runs/[number]">): Promise<Metadata> {
  const { number } = await params;
  return { title: `Run #${number}` };
}

type Comparison = { delta?: number; p_value?: number; baseline?: string; paired?: boolean };

function Tile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  tone?: "fail" | "warn" | "info";
}) {
  const color = tone === "fail" ? "text-fail" : tone === "warn" ? "text-warn" : tone === "info" ? "text-info" : "text-fg";
  return (
    <Card className="flex flex-col gap-1 px-4 py-3">
      <span className="label-caps">{label}</span>
      <span className={cn("font-mono text-[28px] font-semibold leading-8 tracking-[-0.02em] tabular", color)}>
        {value}
      </span>
      {note ? <span className="text-xs text-fg-tertiary">{note}</span> : null}
    </Card>
  );
}

export default async function RunPage({ params }: PageProps<"/app/[org]/[project]/runs/[number]">) {
  const { org, project, number } = await params;
  const ctx = await getProjectContext(org, project);
  const base = `/app/${ctx.org.slug}/${ctx.project.slug}`;
  const run = await getRun(ctx.project.id, Number(number));
  const [conditions, baseline] = await Promise.all([
    getConditions(run.id),
    run.baseline_run_id ? getRunById(run.baseline_run_id) : Promise.resolve(null),
  ]);

  const { data: job } = await (await createClient())
    .from("hosted_jobs")
    .select("id, state, error")
    .eq("id", run.id)
    .maybeSingle();
  const status = runStatus(run);
  const summary = runSummary(run);
  const done = new Set(conditions.map((c) => c.key));
  const pending = plannedConditions(run).filter((p) => !done.has(p.key));
  const running = run.status === "running";

  const episodes = summary.episodes || conditions.reduce((a, c) => a + c.episodes, 0);
  const successes = summary.episodes ? summary.successes : conditions.reduce((a, c) => a + c.successes, 0);
  const rate = episodes ? successes / episodes : null;
  const count = (v: Condition["verdict"]) => conditions.filter((c) => c.verdict === v).length;
  const regressions = conditions.filter((c) =>
    conditionChecks(c).some((ch) => ch.name === "regression" && ch.verdict === "FAIL"),
  ).length;
  const improved = conditions.filter((c) => {
    const cmp = c.comparison as Comparison | null;
    return cmp?.delta != null && cmp.delta > 0.05 && (cmp.p_value ?? 1) < 0.05;
  }).length;

  // Worst first: what needs attention belongs at the top.
  const rank = { ERROR: 0, FAIL: 1, WARN: 2, PASS: 3, SKIP: 4 } as const;
  const sorted = [...conditions].sort(
    (a, b) => rank[a.verdict] - rank[b.verdict] || a.position - b.position,
  );

  // Runtime settings travel in the policy spec, after the question mark.
  const runtime = run.policy_spec.includes("?")
    ? [...new URLSearchParams(run.policy_spec.slice(run.policy_spec.indexOf("?") + 1))].map(
        ([key, value]) => `${key}=${value}`,
      )
    : [];

  const reproduce = [
    `shakedown run <suite> \\`,
    `  --policy "${run.policy_spec || "<policy>"}" \\`,
    `  --label ${run.policy_label}`,
  ].join("\n");

  return (
    <>
      {job && running ? <CloudCollector jobId={job.id} /> : <LiveRefresh active={running} />}
      {job?.state === "failed" ? (
        <p role="alert" className="border-b border-fail-line bg-fail-subtle px-4 py-2 text-[13px] text-fail lg:px-6">
          The cloud run failed: {job.error ?? "no reason was reported"}
        </p>
      ) : null}
      <PageHeader
        crumbs={[{ label: "Runs", href: `${base}/runs` }, { label: `#${run.number}` }]}
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="tabular">Run #{run.number}</span>
            <StatusBadge status={status} />
          </span>
        }
        description={run.git_message ?? undefined}
        meta={
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-fg-secondary">
            <div className="flex items-center gap-1.5">
              <dt className="text-fg-tertiary">Policy</dt>
              <dd className="font-mono text-fg">{run.policy_label}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="text-fg-tertiary">Settings</dt>
              <dd className="font-mono">{runtime.length ? runtime.join(" ") : "as published"}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="text-fg-tertiary">Suite</dt>
              <dd className="font-mono">{run.suite}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Source</dt>
              <dd>
                <GitRef run={run} />
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="text-fg-tertiary">Started</dt>
              <dd>{absoluteTime(run.started_at)}</dd>
            </div>
            {run.duration_s != null ? (
              <div className="flex items-center gap-1.5">
                <dt className="text-fg-tertiary">Took</dt>
                <dd className="tabular">{duration(run.duration_s)}</dd>
              </div>
            ) : null}
          </dl>
        }
        actions={
          baseline ? (
            <LinkButton href={`${base}/compare?base=${baseline.number}&head=${run.number}`}>
              Compare with #{baseline.number}
            </LinkButton>
          ) : (
            <LinkButton href={`${base}/compare?head=${run.number}`}>Compare</LinkButton>
          )
        }
      />

      <div className="flex flex-col gap-6 px-4 py-5 lg:px-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            label="Regressions"
            value={running && !conditions.length ? "–" : regressions}
            tone={regressions ? "fail" : undefined}
            note={
              run.baseline_label ? (
                <>
                  against <span className="font-mono">{run.baseline_label}</span>
                </>
              ) : (
                "no baseline was given"
              )
            }
          />
          <Tile
            label="Success rate"
            value={pct(rate)}
            note={`${successes} of ${episodes} episodes`}
          />
          <Tile
            label="Conditions"
            value={
              <>
                {count("PASS")}
                <span className="text-fg-tertiary">/{conditions.length + pending.length}</span>
              </>
            }
            note={`${count("FAIL") + count("ERROR")} failed, ${count("WARN")} warned${pending.length ? `, ${pending.length} to go` : ""}`}
          />
          <Tile
            label="Improvements"
            value={improved}
            tone={improved ? "info" : undefined}
            note="statistically clear gains"
          />
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className="label-caps h-9 pl-4 pr-3 font-medium">Condition</th>
                  <th scope="col" className="label-caps px-3 text-right font-medium">Success</th>
                  <th scope="col" className="label-caps px-3 font-medium">95% interval</th>
                  <th scope="col" className="label-caps px-3 text-right font-medium">Change</th>
                  <th scope="col" className="label-caps px-3 pr-4 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => {
                  const cmp = c.comparison as Comparison | null;
                  const min = conditionChecks(c).find((ch) => ch.name === "success_rate")?.detail?.min;
                  const tone =
                    c.verdict === "FAIL" || c.verdict === "ERROR"
                      ? "text-fail"
                      : c.verdict === "WARN"
                        ? "text-warn"
                        : "text-fg-secondary";
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-line-subtle transition-colors duration-100 last:border-0 hover:bg-raised"
                    >
                      <td className="py-2 pl-4 pr-3 align-top">
                        <Link
                          href={conditionPath(base, run.number, c.key)}
                          className="flex items-start gap-2"
                        >
                          <StatusIcon status={c.verdict} className="mt-0.5" />
                          <span className="sr-only">{statusMeta[c.verdict].label}:</span>
                          <span className="min-w-0">
                            <span className="block font-medium text-fg">{c.label}</span>
                            <span className="block font-mono text-[11px] text-fg-tertiary">
                              {c.perturbation_summary.join("  ") || "no perturbation"}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right align-top font-mono tabular">
                        <span className="text-fg">{pct(c.success_rate)}</span>
                        <span className="block text-[11px] text-fg-tertiary">
                          {c.successes}/{c.episodes}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span className="flex flex-col gap-1 pt-1">
                          <RateBar
                            rate={c.success_rate}
                            low={c.ci_low}
                            high={c.ci_high}
                            threshold={typeof min === "number" ? min : null}
                          />
                          <span className="font-mono text-[11px] tabular text-fg-tertiary">
                            {pct(c.ci_low)}–{pct(c.ci_high)}
                          </span>
                        </span>
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right align-top font-mono tabular",
                          cmp?.delta == null
                            ? "text-fg-disabled"
                            : cmp.delta < -0.005
                              ? "text-fail"
                              : cmp.delta > 0.005
                                ? "text-info"
                                : "text-fg-secondary",
                        )}
                      >
                        {cmp?.delta == null ? "–" : points(cmp.delta)}
                      </td>
                      <td className={cn("max-w-md px-3 py-2 pr-4 align-top", tone)}>{headline(c)}</td>
                    </tr>
                  );
                })}
                {pending.map((p) => (
                  <tr key={p.key} className="border-b border-line-subtle last:border-0">
                    <td className="py-2 pl-4 pr-3">
                      <span className="flex items-center gap-2 text-fg-tertiary">
                        <StatusIcon status={running ? "RUNNING" : "PENDING"} />
                        {p.label}
                      </span>
                    </td>
                    <td colSpan={4} className="px-3 py-2 text-fg-tertiary">
                      {running ? `${p.episodes} episodes queued` : "did not run"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <details className="group rounded-md border border-line bg-surface">
          <summary className="flex h-10 cursor-pointer list-none items-center px-4 text-[13px] font-medium text-fg-secondary hover:text-fg [&::-webkit-details-marker]:hidden">
            Reproduce this run
          </summary>
          <div className="flex flex-col gap-3 border-t border-line-subtle p-4">
            <CodeBlock code={reproduce} lang="bash" />
            <p className="text-xs text-fg-tertiary">
              Engine {run.engine_version ?? "unknown"}. Seeds are fixed by the scenario files, so
              the same policy on the same kind of machine gives the same outcomes.
            </p>
          </div>
        </details>

        {ctx.canWrite && run.status === "completed" ? (
          <Card>
            <ActionForm
              action={createRelease}
              submit="Create release"
              variant="primary"
              hidden={{ run_id: run.id, next: `${base}/releases` }}
            >
              <div className="px-4 py-3">
                <h2 className="text-sm font-semibold">Propose this for deployment</h2>
                <p className="mt-0.5 text-[13px] text-fg-secondary">
                  A release pins this policy and its runtime settings to this test run. It
                  starts as a candidate and must pass a gate to reach any robot.
                </p>
              </div>
            </ActionForm>
          </Card>
        ) : null}

        {ctx.canWrite && !running ? (
          <ActionForm
            action={deleteRun}
            submit="Delete this run"
            variant="ghost"
            footer={false}
            hidden={{ run_id: run.id, next: `${base}/runs` }}
            confirm={`Delete run #${run.number} with its videos and traces? This cannot be undone.`}
          />
        ) : null}
      </div>
    </>
  );
}
