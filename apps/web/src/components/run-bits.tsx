import { GitBranch, GitCommitHorizontal } from "lucide-react";

import type { Status } from "@/components/ui/status";
import { cn } from "@/lib/cn";
import type { Run, RunSummary } from "@/lib/data";
import { shortSha } from "@/lib/format";

export function runStatus(run: Pick<Run, "status" | "verdict">): Status {
  if (run.status === "running") return "RUNNING";
  if (run.status === "failed") return "ERROR";
  if (run.status === "cancelled") return "SKIP";
  return run.verdict ?? "SKIP";
}

/** One segment per condition, grouped by verdict. Shows the shape of a run at a glance. */
export function VerdictBar({ summary, className }: { summary: RunSummary; className?: string }) {
  const total = summary.conditions || 1;
  const parts = [
    { n: summary.fail + summary.error, cls: "bg-fail-solid", label: "failed" },
    { n: summary.warn, cls: "bg-warn-solid", label: "warned" },
    { n: summary.pass, cls: "bg-pass-solid", label: "passed" },
    { n: summary.skip, cls: "bg-line-strong", label: "skipped" },
  ].filter((p) => p.n > 0);
  const text = parts.map((p) => `${p.n} ${p.label}`).join(", ") || "no results";
  return (
    <span
      role="img"
      aria-label={text}
      title={text}
      className={cn("flex h-1.5 w-24 overflow-hidden rounded-full bg-raised", className)}
    >
      {parts.map((p) => (
        <span key={p.label} className={p.cls} style={{ width: `${(p.n / total) * 100}%` }} />
      ))}
    </span>
  );
}

export function GitRef({ run }: { run: Pick<Run, "git_branch" | "git_sha" | "git_dirty"> }) {
  if (!run.git_branch && !run.git_sha) return <span className="text-fg-disabled">–</span>;
  return (
    <span className="inline-flex items-center gap-2 font-mono text-xs text-fg-secondary">
      {run.git_branch ? (
        <span className="inline-flex items-center gap-1">
          <GitBranch aria-hidden="true" className="size-3 text-fg-tertiary" />
          <span className="max-w-40 truncate">{run.git_branch}</span>
        </span>
      ) : null}
      {run.git_sha ? (
        <span className="inline-flex items-center gap-1">
          <GitCommitHorizontal aria-hidden="true" className="size-3 text-fg-tertiary" />
          {shortSha(run.git_sha)}
          {run.git_dirty ? <span title="Uncommitted changes">*</span> : null}
        </span>
      ) : null}
    </span>
  );
}

/** Success rate with its confidence interval drawn as a range on a 0 to 100 track. */
export function RateBar({
  rate,
  low,
  high,
  threshold,
}: {
  rate: number;
  low: number;
  high: number;
  threshold?: number | null;
}) {
  return (
    <span
      role="img"
      aria-label={`${Math.round(rate * 100)} percent, 95 percent interval ${Math.round(low * 100)} to ${Math.round(high * 100)}`}
      className="relative block h-3 w-28"
    >
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong" />
      <span
        className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-fg-tertiary"
        style={{ left: `${low * 100}%`, width: `${Math.max(1, (high - low) * 100)}%` }}
      />
      <span
        className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg"
        style={{ left: `${rate * 100}%` }}
      />
      {threshold != null ? (
        <span
          title={`Minimum ${Math.round(threshold * 100)}%`}
          className="absolute inset-y-0 w-px bg-accent"
          style={{ left: `${threshold * 100}%` }}
        />
      ) : null}
    </span>
  );
}
