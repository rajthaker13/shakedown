"use client";

import { useActionState } from "react";

import { moveRelease } from "@/app/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";

/** Promote, retire or roll back a release. A failed gate can be overridden, with a reason. */
export function MoveRelease({
  releaseId,
  path,
  to,
  label,
  gateMet,
  variant = "primary",
}: {
  releaseId: string;
  path: string;
  to: "canary" | "fleet" | "retired" | "rolled_back";
  label: string;
  gateMet: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  const [state, run, pending] = useActionState(moveRelease, null);
  const promoting = to === "canary" || to === "fleet";
  const needsReason = !promoting || !gateMet;
  const id = `reason-${releaseId}-${to}`;

  return (
    <form action={run} className="flex flex-col gap-2">
      <input type="hidden" name="release_id" value={releaseId} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="path" value={path} />
      {needsReason ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id} className="text-xs text-fg-secondary">
            {promoting ? "Reason for overriding the gate" : "Reason"}
          </label>
          <Input id={id} name="reason" required minLength={promoting ? 10 : 3} maxLength={1000} />
          {promoting ? (
            <label className="flex items-center gap-2 text-xs text-fg-secondary">
              <input type="checkbox" name="override" required className="size-3.5 accent-[var(--color-accent)]" />
              I am promoting this although the gate is not met. This is recorded.
            </label>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" variant={promoting && !gateMet ? "danger" : variant} disabled={pending}>
          {pending ? "Working…" : promoting && !gateMet ? `${label} anyway` : label}
        </Button>
        <span aria-live="polite" className="text-xs">
          {state?.error ? <span className="text-fail">{state.error}</span> : null}
          {state?.message ? <span className="text-fg-secondary">{state.message}</span> : null}
        </span>
      </div>
    </form>
  );
}
