import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("rounded-md border border-line bg-surface", className)} {...props} />
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line-subtle px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-[13px] text-fg-secondary">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs border border-line bg-raised px-1 font-mono text-[11px] text-fg-secondary">
      {children}
    </kbd>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-line px-6 py-8">
      <div>
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {children ? (
          <div className="mt-1 max-w-xl text-[13px] text-fg-secondary">{children}</div>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-shimmer rounded-xs bg-raised", className)} />;
}
