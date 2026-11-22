"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";

import type { AuthState } from "./actions";

export function SimpleAuthForm({
  title,
  lead,
  action,
  submit,
  children,
}: {
  title: string;
  lead: string;
  action: (prev: AuthState, form: FormData) => Promise<AuthState>;
  submit: string;
  children: ReactNode;
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-[-0.01em]">{title}</h1>
      <p className="mt-1 text-[13px] text-fg-secondary">{lead}</p>
      <form action={run} className="mt-6 flex flex-col gap-4">
        {children}
        {state?.error ? <FormMessage kind="error">{state.error}</FormMessage> : null}
        {state?.message ? <FormMessage kind="success">{state.message}</FormMessage> : null}
        <Button type="submit" variant="primary" size="lg" disabled={pending}>
          {pending ? "One moment…" : submit}
        </Button>
      </form>
      <p className="mt-6 text-[13px] text-fg-secondary">
        <Link href="/login" className="text-accent underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
