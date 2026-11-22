import type { Metadata } from "next";
import Link from "next/link";

import { runStatus } from "@/components/run-bits";
import { PageHeader } from "@/components/shell/shell";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status";
import { listProjects, recentRunsByProject, requireOrg, runSummary, type Run } from "@/lib/data";
import { pct, relativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "Projects" };

/** Overall success rate of recent runs, oldest on the left. */
function Spark({ runs }: { runs: Run[] }) {
  const points = [...runs]
    .reverse()
    .filter((r) => r.status === "completed")
    .map((r) => runSummary(r).success_rate);
  if (points.length < 2) return <span className="text-fg-disabled">–</span>;
  const w = 96;
  const h = 24;
  const d = points
    .map((v, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * w).toFixed(1)},${(2 + (1 - v) * (h - 4)).toFixed(1)}`)
    .join("");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={`Success rate over the last ${points.length} runs, from ${pct(points[0])} to ${pct(points[points.length - 1])}`}
      className="h-6 w-24"
    >
      <path d={d} fill="none" className="stroke-fg-secondary" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default async function ProjectsPage({ params }: PageProps<"/app/[org]">) {
  const { org: slug } = await params;
  const org = await requireOrg(slug);
  const projects = await listProjects(org.id);
  const runs = await recentRunsByProject(projects.map((p) => p.id));

  return (
    <>
      <PageHeader
        title="Projects"
        description="One project per policy and task. Each holds its scenario suite, runs and replays."
        actions={
          <LinkButton href={`/app/${org.slug}/new`} variant="primary">
            New project
          </LinkButton>
        }
      />
      {projects.length === 0 ? (
        <div className="px-4 py-6 lg:px-6">
          <EmptyState
            title="Create your first project"
            action={
              <LinkButton href={`/app/${org.slug}/new`} variant="primary">
                New project
              </LinkButton>
            }
          >
            A project collects the runs of one scenario suite, so that every new checkpoint is
            compared with the ones before it.
          </EmptyState>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="label-caps h-9 pl-4 pr-3 font-medium lg:pl-6">Project</th>
                <th scope="col" className="label-caps px-3 font-medium">Latest run</th>
                <th scope="col" className="label-caps px-3 text-right font-medium">Success</th>
                <th scope="col" className="label-caps px-3 font-medium">Trend</th>
                <th scope="col" className="label-caps px-3 text-right font-medium">Policies</th>
                <th scope="col" className="label-caps px-3 pr-4 font-medium lg:pr-6">Last run</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const own = runs.get(project.id) ?? [];
                const latest = own[0];
                const summary = latest ? runSummary(latest) : null;
                return (
                  <tr key={project.id} className="border-b border-line-subtle transition-colors duration-100 hover:bg-raised">
                    <td className="py-2.5 pl-4 pr-3 lg:pl-6">
                      <Link href={`/app/${org.slug}/${project.slug}`} className="block">
                        <span className="font-medium text-fg">{project.name}</span>
                        <span className="block max-w-md truncate text-xs text-fg-tertiary">
                          {project.description || project.slug}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3">
                      {latest ? (
                        <span className="flex items-center gap-2">
                          <StatusBadge status={runStatus(latest)} />
                          <span className="font-mono text-xs text-fg-secondary">{latest.policy_label}</span>
                        </span>
                      ) : (
                        <span className="text-fg-tertiary">No runs yet</span>
                      )}
                    </td>
                    <td className="px-3 text-right font-mono tabular">
                      {summary?.episodes ? pct(summary.success_rate) : "–"}
                    </td>
                    <td className="px-3">
                      <Spark runs={own} />
                    </td>
                    <td className="px-3 text-right tabular text-fg-secondary">
                      {new Set(own.map((r) => r.policy_label)).size || "–"}
                    </td>
                    <td className="px-3 pr-4 text-fg-secondary lg:pr-6">
                      {latest ? relativeTime(latest.started_at) : "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
