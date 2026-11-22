import type { Metadata } from "next";
import Link from "next/link";

import { FirstRun } from "@/components/first-run";
import { LiveRefresh } from "@/components/live-refresh";
import { Matrix } from "@/components/matrix/matrix";
import { PageHeader } from "@/components/shell/shell";
import { cn } from "@/lib/cn";
import { getProjectContext } from "@/lib/data";
import { buildMatrix } from "@/lib/matrix";

export const metadata: Metadata = { title: "Matrix" };

export default async function MatrixPage({
  params,
  searchParams,
}: PageProps<"/app/[org]/[project]">) {
  const { org, project } = await params;
  const query = await searchParams;
  const ctx = await getProjectContext(org, project);
  const base = `/app/${ctx.org.slug}/${ctx.project.slug}`;
  const suite = typeof query.suite === "string" ? query.suite : undefined;
  const { data, suites, suite: active } = await buildMatrix(ctx, suite);

  if (!data.columns.length) {
    return (
      <>
        <PageHeader title={ctx.project.name} description={ctx.project.description || undefined} />
        <FirstRun settingsHref={`${base}/settings`} canWrite={ctx.canWrite} />
      </>
    );
  }

  const conditions = data.rows.length;
  return (
    <div className="flex h-full flex-col">
      <LiveRefresh active={data.columns.some((c) => c.status === "running")} />
      <PageHeader
        title={ctx.project.name}
        description={
          ctx.project.description ||
          `${data.columns.length} policy version${data.columns.length === 1 ? "" : "s"} across ${conditions} condition${conditions === 1 ? "" : "s"}. Select a cell to see what changed.`
        }
        meta={
          suites.length > 1 ? (
            <nav aria-label="Suite" className="flex flex-wrap gap-1">
              {suites.map((s) => (
                <Link
                  key={s}
                  href={`${base}?suite=${encodeURIComponent(s)}`}
                  aria-current={s === active ? "page" : undefined}
                  className={cn(
                    "rounded-sm border px-2 py-0.5 font-mono text-xs transition-colors duration-100",
                    s === active
                      ? "border-line-strong bg-active text-fg"
                      : "border-line text-fg-secondary hover:text-fg",
                  )}
                >
                  {s}
                </Link>
              ))}
            </nav>
          ) : (
            <span className="font-mono text-xs text-fg-tertiary">suite {active}</span>
          )
        }
      />
      <Matrix data={data} className="flex-1" />
    </div>
  );
}
