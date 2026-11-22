import type { Metadata } from "next";
import Link from "next/link";

import { FirstRun } from "@/components/first-run";
import { LiveRefresh } from "@/components/live-refresh";
import { GitRef, runStatus, VerdictBar } from "@/components/run-bits";
import { PageHeader } from "@/components/shell/shell";
import { LinkButton } from "@/components/ui/button";
import { StatusIcon, statusMeta } from "@/components/ui/status";
import { cn } from "@/lib/cn";
import { getProjectContext, listRuns, plannedConditions, runSummary } from "@/lib/data";
import { duration, pct, relativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "Runs" };

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "FAIL", label: "Failed" },
  { value: "WARN", label: "Warned" },
  { value: "PASS", label: "Passed" },
  { value: "running", label: "Running" },
];

export default async function RunsPage({
  params,
  searchParams,
}: PageProps<"/app/[org]/[project]/runs">) {
  const { org, project } = await params;
  const query = await searchParams;
  const ctx = await getProjectContext(org, project);
  const base = `/app/${ctx.org.slug}/${ctx.project.slug}`;
  const pick = (name: string) => (typeof query[name] === "string" ? (query[name] as string) : "");
  const filters = {
    status: pick("status"),
    branch: pick("branch"),
    policy: pick("policy"),
    suite: pick("suite"),
  };
  const filtered = Object.values(filters).some(Boolean);

  const [runs, all] = await Promise.all([
    listRuns(ctx.project.id, filters),
    filtered ? listRuns(ctx.project.id) : Promise.resolve(null),
  ]);
  const universe = all ?? runs;

  if (!universe.length) {
    return (
      <>
        <PageHeader title="Runs" />
        <FirstRun settingsHref={`${base}/settings`} canWrite={ctx.canWrite} />
      </>
    );
  }

  const href = (patch: Record<string, string>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, ...patch })) if (v) next.set(k, v);
    const q = next.toString();
    return q ? `${base}/runs?${q}` : `${base}/runs`;
  };
  const branches = [...new Set(universe.map((r) => r.git_branch).filter(Boolean))] as string[];
  const policies = [...new Set(universe.map((r) => r.policy_label))];

  return (
    <>
      <LiveRefresh active={runs.some((r) => r.status === "running")} />
      <PageHeader
        title="Runs"
        description="Every suite execution, newest first. Open a run to see each condition and replay its failures."
        actions={
          ctx.canWrite ? (
            <LinkButton href={`${base}/runs/new`} variant="primary">
              New run
            </LinkButton>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line-subtle px-4 py-2.5 lg:px-6">
        <nav aria-label="Filter by result" className="flex gap-1">
          {STATUS_FILTERS.map((f) => (
            <Link
              key={f.label}
              href={href({ status: f.value })}
              aria-current={filters.status === f.value ? "true" : undefined}
              className={cn(
                "rounded-sm px-2 py-1 text-[13px] transition-colors duration-100",
                filters.status === f.value
                  ? "bg-active font-medium text-fg"
                  : "text-fg-secondary hover:bg-raised hover:text-fg",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <FilterLinks label="Policy" value={filters.policy} options={policies} to={(v) => href({ policy: v })} />
        {branches.length > 1 ? (
          <FilterLinks label="Branch" value={filters.branch} options={branches} to={(v) => href({ branch: v })} />
        ) : null}
        {filtered ? (
          <Link href={`${base}/runs`} className="text-[13px] text-accent underline-offset-4 hover:underline">
            Clear filters
          </Link>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left">
              {["Run", "Policy", "Source", "Conditions", "Success", "Regressions", "Duration", "Started"].map(
                (h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={cn(
                      "label-caps h-9 px-3 font-medium first:pl-4 last:pr-4 lg:first:pl-6 lg:last:pr-6",
                      i >= 4 && i <= 6 ? "text-right" : "",
                    )}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const status = runStatus(run);
              const summary = runSummary(run);
              const planned = plannedConditions(run).length;
              return (
                <tr
                  key={run.id}
                  className="border-b border-line-subtle transition-colors duration-100 hover:bg-raised"
                >
                  <td className="h-11 pl-4 pr-3 lg:pl-6">
                    <Link
                      href={`${base}/runs/${run.number}`}
                      className="flex items-center gap-2 font-medium text-fg"
                    >
                      <StatusIcon status={status} />
                      <span className="tabular">#{run.number}</span>
                      <span className="sr-only">{statusMeta[status].label}</span>
                      <span className="max-w-56 truncate font-normal text-fg-secondary">
                        {run.git_message ?? run.suite}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 font-mono text-xs text-fg">{run.policy_label}</td>
                  <td className="px-3">
                    <GitRef run={run} />
                  </td>
                  <td className="px-3">
                    {run.status === "running" ? (
                      <span className="text-running">{planned ? `of ${planned} planned` : "running"}</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <VerdictBar summary={summary} />
                        <span className="tabular text-fg-secondary">
                          {summary.pass}/{summary.conditions}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-3 text-right font-mono tabular text-fg">
                    {summary.episodes ? pct(summary.success_rate) : "–"}
                  </td>
                  <td
                    className={cn(
                      "px-3 text-right font-mono tabular",
                      summary.regressions ? "font-medium text-fail" : "text-fg-tertiary",
                    )}
                  >
                    {run.status === "running" ? "–" : summary.regressions}
                  </td>
                  <td className="px-3 text-right tabular text-fg-secondary">{duration(run.duration_s)}</td>
                  <td className="pl-3 pr-4 text-fg-secondary lg:pr-6" title={run.started_at}>
                    {relativeTime(run.started_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {runs.length === 0 ? (
          <p className="px-6 py-10 text-center text-[13px] text-fg-secondary">
            No runs match these filters.
          </p>
        ) : null}
      </div>
    </>
  );
}

function FilterLinks({
  label,
  value,
  options,
  to,
}: {
  label: string;
  value: string;
  options: string[];
  to: (value: string) => string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[13px]">
      <span className="text-fg-tertiary">{label}</span>
      {options.slice(0, 8).map((option) => (
        <Link
          key={option}
          href={to(value === option ? "" : option)}
          aria-current={value === option ? "true" : undefined}
          className={cn(
            "rounded-xs border px-1.5 py-0.5 font-mono text-xs transition-colors duration-100",
            value === option
              ? "border-line-strong bg-active text-fg"
              : "border-line text-fg-secondary hover:border-line-strong hover:text-fg",
          )}
        >
          {option}
        </Link>
      ))}
    </div>
  );
}
