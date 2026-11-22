import { AlertTriangle, Info, Link2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

function Anchor({ id, title }: { id: string; title: string }) {
  return (
    <a
      href={`#${id}`}
      aria-label={`Link to section: ${title}`}
      className="ml-2 inline-flex size-6 items-center justify-center rounded-xs align-middle text-fg-tertiary opacity-0 transition-opacity duration-100 hover:text-accent focus-visible:opacity-100 group-hover:opacity-100"
    >
      <Link2 aria-hidden="true" className="size-4" />
    </a>
  );
}

export function H2({ id, children }: { id: string; children: string }) {
  return (
    <h2
      id={id}
      className="group mt-14 scroll-mt-24 border-t border-line-subtle pt-8 text-[22px] font-semibold leading-7 tracking-[-0.02em] text-fg"
    >
      {children}
      <Anchor id={id} title={children} />
    </h2>
  );
}

export function H3({ id, children, mono = false }: { id: string; children: string; mono?: boolean }) {
  return (
    <h3
      id={id}
      className={cn(
        "group mt-10 scroll-mt-24 font-semibold tracking-[-0.02em] text-fg",
        mono ? "font-mono text-[16px] leading-6" : "text-[17px] leading-6",
      )}
    >
      {children}
      <Anchor id={id} title={children} />
    </h3>
  );
}

export function P({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("mt-4 text-base leading-[26px] text-fg-secondary", className)}>{children}</p>
  );
}

export function UL({ children }: { children: ReactNode }) {
  return (
    <ul className="mt-4 list-disc space-y-2 pl-5 text-base leading-[26px] text-fg-secondary marker:text-fg-disabled">
      {children}
    </ul>
  );
}

export function OL({ children }: { children: ReactNode }) {
  return (
    <ol className="mt-4 list-decimal space-y-2 pl-5 text-base leading-[26px] text-fg-secondary marker:font-mono marker:text-[13px] marker:text-fg-tertiary">
      {children}
    </ol>
  );
}

export function LI({ children }: { children: ReactNode }) {
  return <li className="pl-1">{children}</li>;
}

/** Inline code. */
export function C({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-xs border border-line-subtle bg-raised px-1 py-px font-mono text-[0.85em] text-fg [overflow-wrap:anywhere]">
      {children}
    </code>
  );
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-fg">{children}</strong>;
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  const className =
    "text-accent underline decoration-accent-line underline-offset-4 transition-colors duration-100 hover:decoration-accent";
  if (href.startsWith("/") || href.startsWith("#")) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={className} rel="noreferrer">
      {children}
    </a>
  );
}

const calloutKinds = {
  note: {
    label: "Note",
    icon: Info,
    box: "border-info-line bg-info-subtle",
    text: "text-info",
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    box: "border-warn-line bg-warn-subtle",
    text: "text-warn",
  },
} as const;

export function Callout({
  kind = "note",
  title,
  children,
}: {
  kind?: keyof typeof calloutKinds;
  title?: string;
  children: ReactNode;
}) {
  const meta = calloutKinds[kind];
  const Icon = meta.icon;
  return (
    <aside
      role="note"
      className={cn("my-6 flex gap-3 rounded-md border px-4 py-3.5", meta.box)}
    >
      <Icon aria-hidden="true" className={cn("mt-[3px] size-4 shrink-0", meta.text)} />
      <div className="min-w-0 text-[15px] leading-6 text-fg-secondary">
        <p className={cn("text-[11px] font-medium uppercase leading-4 tracking-[0.06em]", meta.text)}>{title ? `${meta.label}: ${title}` : meta.label}</p>
        <div className="mt-1 [&>p]:mt-2 [&>p:first-child]:mt-0">{children}</div>
      </div>
    </aside>
  );
}

/** Numbered steps, used for short procedures. */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="mt-6 space-y-5">{children}</ol>;
}

export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span
        aria-hidden="true"
        className="tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-xs border border-line bg-surface font-mono text-[12px] text-fg-secondary"
      >
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-base font-semibold leading-[26px] text-fg">
          <span className="sr-only">Step {n}: </span>
          {title}
        </p>
        <div className="mt-1 text-base leading-[26px] text-fg-secondary">{children}</div>
      </div>
    </li>
  );
}
