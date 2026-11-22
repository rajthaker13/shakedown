import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/code/code-block";
import { PageHeader } from "@/components/shell/shell";
import { EmptyState } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { getConditions, getProjectContext, listRuns } from "@/lib/data";

export const metadata: Metadata = { title: "Scenarios" };

export default async function ScenariosPage({
  params,
  searchParams,
}: PageProps<"/app/[org]/[project]/scenarios">) {
  const { org, project } = await params;
  const query = await searchParams;
  const ctx = await getProjectContext(org, project);
  const root = `/app/${ctx.org.slug}/${ctx.project.slug}`;
  const runs = await listRuns(ctx.project.id, {}, 50);
  const latest = runs.find((r) => r.status === "completed") ?? runs[0];

  if (!latest) {
    return (
      <>
        <PageHeader title="Scenarios" />
        <div className="px-4 py-6 lg:px-6">
          <EmptyState title="No scenarios yet">
            Scenario files are uploaded with each run. They appear here after the first one.
          </EmptyState>
        </div>
      </>
    );
  }

  const conditions = await getConditions(latest.id);
  // One scenario file can expand into several conditions; group them back.
  const files = new Map<
    string,
    { source: string; description: string; env: string; tags: string[]; keys: string[] }
  >();
  for (const c of conditions) {
    const entry = files.get(c.scenario);
    if (entry) entry.keys.push(c.key);
    else {
      files.set(c.scenario, {
        source: c.scenario_source,
        description: c.description,
        env: c.env,
        tags: c.tags,
        keys: [c.key],
      });
    }
  }
  const names = [...files.keys()];
  const active = typeof query.file === "string" && files.has(query.file) ? query.file : names[0];
  const file = files.get(active)!;

  return (
    <>
      <PageHeader
        title="Scenarios"
        description={
          <>
            The suite <span className="font-mono">{latest.suite}</span> as it was in run #
            {latest.number}. Scenario files live in your repository; this is a read-only copy.
          </>
        }
      />
      <div className="grid gap-5 px-4 py-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-6">
        <nav aria-label="Scenario files">
          <ul className="flex flex-col gap-0.5 max-lg:flex-row max-lg:flex-wrap">
            {names.map((name) => (
              <li key={name}>
                <Link
                  href={`${root}/scenarios?file=${encodeURIComponent(name)}`}
                  aria-current={name === active ? "page" : undefined}
                  className={cn(
                    "flex h-8 items-center justify-between gap-2 rounded-sm px-2.5 font-mono text-xs transition-colors duration-100",
                    name === active
                      ? "bg-active text-fg"
                      : "text-fg-secondary hover:bg-raised hover:text-fg",
                  )}
                >
                  <span className="truncate">{name}.yaml</span>
                  {files.get(name)!.keys.length > 1 ? (
                    <span className="tabular text-fg-tertiary">{files.get(name)!.keys.length}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <p className="text-[13px] text-fg-secondary">{file.description}</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs text-fg-tertiary">{file.env}</span>
              {file.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-xs border border-line px-1.5 text-[11px] text-fg-secondary"
                >
                  {tag}
                </span>
              ))}
            </p>
          </div>
          <CodeBlock
            code={file.source}
            lang="yaml"
            filename={`${active}.yaml`}
            lineNumbers
            anchorPrefix=""
          />
          <div>
            <h2 className="label-caps mb-1.5">
              Expands to {file.keys.length} condition{file.keys.length === 1 ? "" : "s"}
            </h2>
            <ul className="flex flex-wrap gap-1.5">
              {file.keys.map((key) => (
                <li key={key}>
                  <Link
                    href={`${root}/runs/${latest.number}/${encodeURIComponent(key)}`}
                    className="rounded-xs border border-line bg-raised px-1.5 py-0.5 font-mono text-xs text-fg-secondary transition-colors duration-100 hover:border-line-strong hover:text-fg"
                  >
                    {key}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
