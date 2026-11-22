"use client";

import { useActionState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { cn } from "@/lib/cn";

type State = { error?: string; message?: string; secret?: string } | null;
type Action = (prev: State, form: FormData) => Promise<State>;

/** A form bound to a server action, with its pending and result states. */
export function ActionForm({
  action,
  children,
  submit,
  variant = "secondary",
  hidden,
  className,
  footer = true,
  confirm,
}: {
  action: Action;
  children?: ReactNode;
  submit: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  hidden?: Record<string, string>;
  className?: string;
  /** Put the button in a bordered footer, as in a settings card. */
  footer?: boolean;
  /** Ask before submitting. Used for actions that cannot be undone. */
  confirm?: string;
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form
      action={run}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
      className={className}
    >
      {hidden
        ? Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))
        : null}
      {children}
      <div
        className={cn(
          "flex flex-wrap items-center gap-3",
          footer ? "justify-between border-t border-line-subtle px-4 py-3" : "",
        )}
      >
        <div aria-live="polite" className="min-w-0 text-[13px]">
          {state?.error ? <span className="text-fail">{state.error}</span> : null}
          {state?.message && !state.secret ? (
            <span className="text-fg-secondary">{state.message}</span>
          ) : null}
        </div>
        <Button type="submit" variant={variant} disabled={pending}>
          {pending ? "Working…" : submit}
        </Button>
      </div>
      {state?.error && !footer ? <FormMessage kind="error">{state.error}</FormMessage> : null}
    </form>
  );
}
