import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

const control =
  "w-full rounded-sm border border-line-control bg-raised px-2.5 text-[13px] text-fg " +
  "placeholder:text-fg-tertiary transition-[border-color] duration-100 " +
  "hover:border-fg-tertiary focus-visible:border-accent " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 py-2 leading-5", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(control, "h-8 pr-7", className)} {...props}>
      {children}
    </select>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-fg">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-fail">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-fg-tertiary">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormMessage({
  kind,
  children,
}: {
  kind: "error" | "success" | "info";
  children: ReactNode;
}) {
  const styles = {
    error: "border-fail-line bg-fail-subtle text-fail",
    success: "border-pass-line bg-pass-subtle text-pass",
    info: "border-info-line bg-info-subtle text-info",
  }[kind];
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={cn("rounded-sm border px-3 py-2 text-[13px]", styles)}
    >
      {children}
    </p>
  );
}
