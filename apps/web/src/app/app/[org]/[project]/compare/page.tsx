import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shell/shell";
import { Card, EmptyState } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { getConditions, getProjectContext, listRuns, projectSettings, type Run } from "@/lib/data";
import { pct, points, pValue } from "@/lib/format";
import { conditionPath } from "@/lib/matrix";
import { classify, compare, type Comparison, type DeltaClass, type Outcomes } from "@/lib/stats";

import { ComparePicker } from "./picker";

export const metadata: Metadata = { title: "Compare" };

const META: Record<DeltaClass, { label: string; text: string; bar: string }> = {
  regression: { label: "Regression", text: "text-fail", bar: "bg-fail-solid" },
  suspect: { label: "Possible regression", text: "text-warn", bar: "bg-warn-solid" },
  unchanged: { label: "No clear change", text: "text-fg-tertiary", bar: "bg-line-strong" },
  improvement: { label: "Improvement", text: "text-info", bar: "bg-info-solid" },
};

/** Base and head rate joined by a line, on a shared 0 to 100 track. */
function Dumbbell({ base, head, kind }: { base: number; head: number; kind: DeltaClass }) {
  const left = Math.min(base, head) * 100;
  const width = Math.abs(head - base) * 100;
  return (
    <span
      role="img"
      aria-label={`From ${Math.round(base * 100)} percent to ${Math.round(head * 100)} percent`}
      className="relative block h-4 w-full min-w-40"
    >
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
      <span
        className={cn("absolute top-1/2 h-0.5 -translate-y-1/2", META[kind].bar)}
        style={{ left: `${left}%`, width: `${width}%` }}
      />
      <span
        title="Base"
        className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-fg-secondary bg-base"
        style={{ left: `${base * 100}%` }}
      />
      <span
        title="Head"
        className={cn("absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full", META[kind].bar)}
        style={{ left: `${head * 100}%` }}
      />
    </span>
  );
}

function SeedLinks({ seeds, href, label }: { seeds: number[]; href: string; label: string }) {
  if (!seeds.length) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span className="text-[11px] text-fg-tertiary">{label}</span>
      {seeds.slice(0, 12).map((seed) => (
        <Link
          key={seed}
          href={`${href}/${seed}`}
          className="rounded-xs border border-line bg-raised px-1 font-mono text-[11px] text-fg-secondary transition-colors duration-100 hover:border-line-strong hover:text-fg"
        >
          {seed}
        </Link>
      ))}
      {seeds.length > 12 ? (
        <span className="text-[11px] text-fg-tertiary">+{seeds.length - 12}</span>
      ) : null}
    </span>
  );
}

export default async function ComparePage({
  params,
  searchParams,
}: PageProps<"/app/[org]/[project]/compare">) {
  const { org, project } = await params;
  const query = await searchParams;
  const ctx = await getProjectContext(org, project);
  const root = `/app/${ctx.org.slug}/${ctx.project.slug}`;
  const runs = (await listRuns(ctx.project.id)).filter((r) => r.status === "completed");

  if (runs.length < 2) {
    return (
      <>
        <PageHeader title="Compare" />
        <div className="px-4 py-6 lg:px-6">
          <EmptyState title="Two completed runs are needed">
            Run the same suite against two policy versions. With the same seeds, the comparison
            is paired and shows exactly which episodes changed outcome.
          </EmptyState>
        </div>
      </>
    );
  }

  const byNumber = new Map(runs.map((r) => [r.number, r]));
  const num = (name: string) => (typeof query[name] === "string" ? Number(query[name]) : NaN);
  const head: Run = byNumber.get(num("head")) ?? runs[0];
  const fallbackBase =
    runs.find((r) => r.id === head.baseline_run_id) ??
    runs.find((r) => r.id !== head.id && r.suite === head.suite) ??
    runs.find((r) => r.id !== head.id)!;
  const base: Run = byNumber.get(num("base")) ?? fallbackBase;
  const showAll = query.show === "all";

  const [baseConditions, headConditions] = await Promise.all([
    getConditions(base.id),
    getConditions(head.id),
  ]);
  const baseByKey = new Map(baseConditions.map((c) => [c.key, c]));
  const maxDrop = projectSettings(ctx.project).noise_threshold_pts / 100;

  const rows = headConditions
    .map((h) => {
      const b = baseByKey.get(h.key);
      if (!b) return null;
      const cmp: Comparison = compare(
        (b.outcomes ?? {}) as Outcomes,
        (h.outcomes ?? {}) as Outcomes,
        b.fingerprint === h.fingerprint,
      );
      return { head: h, base: b, cmp, kind: classify(cmp, maxDrop) };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.cmp.delta - b.cmp.delta);

  const onlyInHead = headConditions.filter((h) => !baseByKey.has(h.key));
  const headKeys = new Set(headConditions.map((h) => h.key));
  const onlyInBase = baseConditions.filter((b) => !headKeys.has(b.key));
  const tally = (kind: DeltaClass) => rows.filter((r) => r.kind === kind).length;
  const visible = showAll ? rows : rows.filter((r) => r.kind !== "unchanged");
  const link = (patch: Record<string, string>) => {
    const next = new URLSearchParams({ base: String(base.number), head: String(head.number) });
    if (showAll) next.set("show", "all");
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    return `${root}/compare?${next}`;
  };

  return (
    <>
      <PageHeader
        title="Compare"
        description="Two runs, condition by condition, worst change first."
        actions={
          <ComparePicker
            root={root}
            base={base.number}
            head={head.number}
            showAll={showAll}
            runs={runs.map((r) => ({ number: r.number, label: r.policy_label, suite: r.suite }))}
          />
        }
      />

      <div className="flex flex-col gap-5 px-4 py-5 lg:px-6">
        <p className="text-sm text-fg">
          From <span className="font-mono">{base.policy_label}</span> to{" "}
          <span className="font-mono">{head.policy_label}</span>:{" "}
          <span className={tally("regression") ? "font-medium text-fail" : ""}>
            {tally("regression")} regressed
          </span>
          , <span className={tally("suspect") ? "text-warn" : ""}>{tally("suspect")} possibly regressed</span>
          , <span className={tally("improvement") ? "text-info" : ""}>{tally("improvement")} improved</span>
          , {tally("unchanged")} showed no clear change.
        </p>

        {base.suite !== head.suite ? (
          <p role="alert" className="rounded-sm border border-warn-line bg-warn-subtle px-3 py-2 text-[13px] text-warn">
            These runs used different suites ({base.suite} and {head.suite}). Only conditions
            with the same name are compared.
          </p>
        ) : null}

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line-subtle px-4 py-2">
            <h2 className="label-caps">
              {showAll ? "All conditions" : "Changed conditions"} ({visible.length})
            </h2>
            <Link
              href={link({ show: showAll ? "" : "all" })}
              className="text-[13px] text-accent underline-offset-4 hover:underline"
            >
              {showAll ? "Show changed only" : `Show all ${rows.length}`}
            </Link>
          </div>
          {visible.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-fg-secondary">
              No condition changed by more than {projectSettings(ctx.project).noise_threshold_pts}{" "}
              points with statistical support.
            </p>
          ) : (
            <ul>
              {visible.map(({ head: h, base: b, cmp, kind }) => (
                <li
                  key={h.key}
                  className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 border-b border-line-subtle px-4 py-3 last:border-0 max-md:grid-cols-1"
                >
                  <div className="min-w-0">
                    <Link
                      href={conditionPath(root, head.number, h.key)}
                      className="text-[13px] font-medium text-fg underline-offset-4 hover:underline"
                    >
                      {h.label}
                    </Link>
                    <p className={cn("text-xs", META[kind].text)}>
                      {META[kind].label}
                      <span className="text-fg-tertiary">
                        {" "}
                        · p {pValue(cmp.pValue)} · {cmp.paired ? "paired" : "unpaired"}
                      </span>
                    </p>
                    <div className="mt-1.5 flex flex-col gap-1">
                      <SeedLinks
                        label="broke"
                        seeds={cmp.regressed}
                        href={conditionPath(root, head.number, h.key)}
                      />
                      <SeedLinks
                        label="fixed"
                        seeds={cmp.improved}
                        href={conditionPath(root, head.number, h.key)}
                      />
                    </div>
                  </div>
                  <Dumbbell base={cmp.baseRate} head={cmp.headRate} kind={kind} />
                  <div className="flex items-baseline gap-3 font-mono tabular">
                    <span className="text-xs text-fg-tertiary">
                      {pct(cmp.baseRate)} → {pct(cmp.headRate)}
                    </span>
                    <span className={cn("w-10 text-right text-sm font-medium", META[kind].text)}>
                      {points(cmp.delta)}
                    </span>
                    <span className="sr-only">
                      base {b.successes} of {b.episodes}, head {h.successes} of {h.episodes}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {onlyInHead.length || onlyInBase.length ? (
          <p className="text-xs text-fg-tertiary">
            {onlyInHead.length
              ? `Only in #${head.number}: ${onlyInHead.map((c) => c.key).join(", ")}. `
              : ""}
            {onlyInBase.length
              ? `Only in #${base.number}: ${onlyInBase.map((c) => c.key).join(", ")}.`
              : ""}
          </p>
        ) : null}
      </div>
    </>
  );
}
