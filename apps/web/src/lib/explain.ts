import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import type { Trace } from "@/lib/artifacts";

export const EXPLAIN_MODEL = "claude-opus-5";

export function explainAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const SYSTEM = `You help robotics engineers understand why a learned manipulation policy failed one simulated episode.

You are given the test condition, the outcome, and per-step signals recorded during the episode, alongside the same signals from the same policy on the same random seed with no perturbation applied (the nominal run).

Write a short diagnosis for an engineer who will open the replay next. Use this structure, in plain prose with no headings:

1. One sentence stating what happened, in terms of the task stages the episode did and did not reach.
2. Two to four sentences pointing at the specific steps and signals that show where the episode went wrong, quoting step numbers and values from the data.
3. One or two sentences naming the most likely cause given the perturbation, stated as a hypothesis.
4. One sentence suggesting what to look at in the replay or what to test next to confirm it.

Rules:
- Every factual statement must be supported by the data you were given. Do not invent step numbers, values, or events.
- You cannot see the video or the policy's internals. Do not describe what the camera image looked like or what the network "thought".
- The first divergent step is a heuristic based on commanded actions. Treat it as where to start looking, not as proof of cause.
- If the nominal run also failed on this seed, say so plainly: the perturbation may not be the cause.
- If the data does not support a confident explanation, say that instead of guessing.
- Under 170 words. No lists, no markdown, no preamble.`;

/** Reduce a signal to at most `points` samples, keeping the step index of each. */
function sample(values: number[], points = 40): string {
  if (!values.length) return "(none)";
  const stride = Math.max(1, Math.ceil(values.length / points));
  const out: string[] = [];
  for (let i = 0; i < values.length; i += stride) out.push(`${i}:${Number(values[i].toFixed(3))}`);
  const last = values.length - 1;
  if (last % stride !== 0) out.push(`${last}:${Number(values[last].toFixed(3))}`);
  return out.join(" ");
}

export type ExplainInput = {
  policy: string;
  env: string;
  conditionLabel: string;
  conditionDescription: string;
  perturbations: string[];
  failureLabel: string | null;
  conditionRate: number;
  conditionEpisodes: number;
  trace: Trace;
  nominal: Trace | null;
};

export function buildPrompt(input: ExplainInput): string {
  const { trace, nominal } = input;
  const lines = [
    `Environment: ${input.env}`,
    `Policy: ${input.policy}`,
    `Condition: ${input.conditionLabel}`,
    input.conditionDescription ? `Condition description: ${input.conditionDescription}` : "",
    `Perturbations applied: ${input.perturbations.join("; ") || "none"}`,
    `Success rate of this policy under this condition: ${(input.conditionRate * 100).toFixed(0)}% over ${input.conditionEpisodes} episodes`,
    "",
    `This episode: seed ${trace.seed}, FAILED after ${trace.steps} steps (control rate ${trace.fps} Hz).`,
    `Furthest task stage reached (max reward): ${trace.max_reward}`,
    `Engine's failure label: ${input.failureLabel ?? "none"}`,
    `First sustained divergence from nominal actions: ${trace.first_divergence_step == null ? "none detected" : `step ${trace.first_divergence_step}`}`,
    `First contact by group (step): ${
      Object.entries(trace.contacts)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ") || "none"
    }`,
    "",
    nominal
      ? `Nominal run on the same seed: ${nominal.success ? "SUCCEEDED" : "FAILED"} in ${nominal.steps} steps, max reward ${nominal.max_reward}.`
      : "Nominal run on the same seed: not available.",
    "",
    "Signals are given as step:value pairs, downsampled.",
  ].filter((l) => l !== "");

  for (const [name, values] of Object.entries(trace.signals)) {
    lines.push("", `[${name}] this episode: ${sample(values)}`);
    const ref = nominal?.signals[name];
    if (ref?.length && name !== "action_divergence") lines.push(`[${name}] nominal: ${sample(ref)}`);
  }
  return lines.join("\n");
}

export type ExplainResult =
  | { ok: true; text: string; model: string }
  | { ok: false; error: string; status: number };

export async function explainFailure(input: ExplainInput): Promise<ExplainResult> {
  const client = new Anthropic();
  try {
    const stream = client.beta.messages.stream({
      model: EXPLAIN_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      // If the primary model declines, the same request is retried on the fallback.
      betas: ["server-side-fallback-2026-06-01"],
      fallbacks: [{ model: "claude-opus-4-8" }],
      system: SYSTEM,
      messages: [{ role: "user", content: buildPrompt(input) }],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      return { ok: false, status: 422, error: "The model declined to analyze this episode." };
    }
    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (!text) return { ok: false, status: 502, error: "The model returned no explanation." };
    return { ok: true, text, model: message.model };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return { ok: false, status: 503, error: "The Anthropic API key on this server is not valid." };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, status: 429, error: "The model is rate limited. Try again in a minute." };
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return { ok: false, status: 502, error: "Could not reach the Anthropic API." };
    }
    if (error instanceof Anthropic.APIError) {
      console.error("explain", error.status, error.message);
      return { ok: false, status: 502, error: "The model request failed." };
    }
    throw error;
  }
}
