import { AlertTriangle, CheckCircle2, Loader2, MinusCircle, XCircle, Zap } from "lucide-react";

import { cn } from "@/lib/cn";

export type Verdict = "PASS" | "WARN" | "FAIL" | "SKIP" | "ERROR";
export type Status = Verdict | "RUNNING" | "PENDING";

/**
 * Status is never carried by color alone: every state has its own icon and a
 * written label.
 */
export const statusMeta: Record<
  Status,
  { label: string; text: string; subtle: string; line: string; icon: typeof CheckCircle2 }
> = {
  PASS: { label: "Pass", text: "text-pass", subtle: "bg-pass-subtle", line: "border-pass-line", icon: CheckCircle2 },
  WARN: { label: "Warn", text: "text-warn", subtle: "bg-warn-subtle", line: "border-warn-line", icon: AlertTriangle },
  FAIL: { label: "Fail", text: "text-fail", subtle: "bg-fail-subtle", line: "border-fail-line", icon: XCircle },
  ERROR: { label: "Error", text: "text-fail", subtle: "bg-fail-subtle", line: "border-fail-line", icon: Zap },
  SKIP: { label: "Skipped", text: "text-fg-tertiary", subtle: "bg-raised", line: "border-line", icon: MinusCircle },
  RUNNING: { label: "Running", text: "text-running", subtle: "bg-running-subtle", line: "border-running-line", icon: Loader2 },
  PENDING: { label: "Queued", text: "text-fg-tertiary", subtle: "bg-raised", line: "border-line", icon: MinusCircle },
};

export function StatusIcon({ status, className }: { status: Status; className?: string }) {
  const meta = statusMeta[status];
  const Icon = meta.icon;
  return (
    <Icon
      aria-hidden="true"
      strokeWidth={2}
      className={cn(
        "size-4 shrink-0",
        meta.text,
        status === "RUNNING" && "animate-spin-slow motion-reduce:animate-none",
        className,
      )}
    />
  );
}

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const meta = statusMeta[status];
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1 rounded-xs border px-1.5 text-[11px] font-medium uppercase tracking-[0.04em]",
        meta.subtle,
        meta.line,
        meta.text,
        className,
      )}
    >
      <StatusIcon status={status} className="size-3" />
      {meta.label}
    </span>
  );
}
