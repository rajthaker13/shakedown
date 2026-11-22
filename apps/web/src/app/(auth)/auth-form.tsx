"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/form";

import type { AuthState } from "./actions";

export function AuthForm({
  mode,
  action,
  next,
}: {
  mode: "login" | "signup";
  action: (prev: AuthState, form: FormData) => Promise<AuthState>;
  next?: string;
}) {
  const [state, submit, pending] = useActionState(action, null);
  const signup = mode === "signup";
  const suffix = next ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-[-0.01em]">
        {signup ? "Create your account" : "Sign in"}
      </h1>
      <p className="mt-1 text-[13px] text-fg-secondary">
        {signup
          ? "Free while you evaluate. No card needed."
          : "Pick up where your last run left off."}
      </p>

      <form action={submit} className="mt-6 flex flex-col gap-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        {signup ? (
          <Field label="Name" htmlFor="name">
            <Input id="name" name="name" autoComplete="name" maxLength={80} />
          </Field>
        ) : null}
        <Field label="Work email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={state?.email ?? ""}
            spellCheck={false}
          />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          hint={signup ? "At least 8 characters." : undefined}
        >
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={signup ? "new-password" : "current-password"}
          />
        </Field>

        {state?.error ? <FormMessage kind="error">{state.error}</FormMessage> : null}
        {state?.message ? <FormMessage kind="success">{state.message}</FormMessage> : null}

        <Button type="submit" variant="primary" size="lg" disabled={pending} className="mt-1">
          {pending ? "One moment…" : signup ? "Create account" : "Sign in"}
        </Button>
      </form>

      {signup ? null : (
        <p className="mt-4 text-[13px]">
          <Link href="/forgot" className="text-fg-secondary underline-offset-4 hover:text-fg hover:underline">
            Forgot your password?
          </Link>
        </p>
      )}

      <p className="mt-6 text-[13px] text-fg-secondary">
        {signup ? "Already have an account? " : "New to Shakedown? "}
        <Link
          href={`${signup ? "/login" : "/signup"}${suffix}`}
          className="text-accent underline-offset-4 hover:underline"
        >
          {signup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}
