"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function Explain({ episodeId, available }: { episodeId: string; available: boolean }) {
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "done"; text: string; model: string } | { kind: "error"; message: string }
  >({ kind: "idle" });

  if (!available) return null;

  async function run() {
    setState({ kind: "loading" });
    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episode: episodeId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setState({ kind: "error", message: body.error ?? "The request failed." });
        return;
      }
      setState({ kind: "done", text: body.text, model: body.model });
    } catch {
      setState({ kind: "error", message: "Could not reach the server." });
    }
  }

  return (
    <section aria-label="Explanation" className="rounded-md border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Explain this failure</h2>
          <p className="mt-0.5 text-[13px] text-fg-secondary">
            Sends the recorded signals, not the video, to a language model and asks where the
            episode went wrong.
          </p>
        </div>
        <Button onClick={run} disabled={state.kind === "loading"}>
          <Sparkles aria-hidden="true" className="size-3.5" />
          {state.kind === "loading" ? "Reading the trace…" : state.kind === "done" ? "Run again" : "Explain"}
        </Button>
      </div>
      <div aria-live="polite">
        {state.kind === "done" ? (
          <div className="border-t border-line-subtle px-4 py-3">
            <p className="max-w-3xl whitespace-pre-line text-[13px] leading-5 text-fg">{state.text}</p>
            <p className="mt-2 text-xs text-fg-tertiary">
              Written by {state.model} from the signals alone. It is a starting point for your own
              look at the replay, and it can be wrong.
            </p>
          </div>
        ) : null}
        {state.kind === "error" ? (
          <p role="alert" className="border-t border-line-subtle px-4 py-3 text-[13px] text-fail">
            {state.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
