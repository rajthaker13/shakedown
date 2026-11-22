import "server-only";

import type { z } from "zod";

import { ApiError } from "@/lib/api/errors";
import { condition as conditionSchema, isArtifactPath, storagePath } from "@/lib/api/schema";
import type { Json } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

export type ConditionInput = z.infer<typeof conditionSchema>;

/**
 * Store one finished condition and its episodes. Shared by the API that the
 * CLI uploads to and by the collector for cloud runs, so both write the same
 * rows.
 */
export async function ingestCondition(
  projectId: string,
  runId: string,
  body: ConditionInput,
): Promise<{ conditionId: string; episodes: number }> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("run_conditions")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId);

  const { data: row, error } = await admin
    .from("run_conditions")
    .upsert(
      {
        run_id: runId,
        project_id: projectId,
        position: count ?? 0,
        key: body.key,
        scenario: body.scenario,
        label: body.label,
        description: body.description,
        env: body.env,
        backend: body.backend,
        sweep_name: body.sweep_name ?? null,
        sweep_value: body.sweep_value == null ? null : String(body.sweep_value),
        tags: body.tags,
        perturbations: body.perturbations as Json,
        perturbation_summary: body.perturbation_summary,
        fingerprint: body.fingerprint,
        episodes: body.episodes,
        successes: body.successes,
        success_rate: body.success_rate,
        ci_low: body.ci_low,
        ci_high: body.ci_high,
        mean_steps_success: body.mean_steps_success ?? null,
        contacts: body.contacts,
        failure_labels: body.failure_labels,
        verdict: body.verdict,
        checks: body.checks as Json,
        comparison: (body.comparison ?? null) as Json,
        outcomes: body.outcomes,
        duration_s: body.duration_s ?? null,
        scenario_source: body.scenario_source,
        error: body.error ?? null,
      },
      { onConflict: "run_id,key" },
    )
    .select("id")
    .single();
  if (error) {
    console.error("insert condition", error);
    throw new ApiError(500, "Could not store the condition.");
  }

  const pathFor = (relative: string | null | undefined) =>
    relative && isArtifactPath(relative) ? storagePath(projectId, runId, relative) : null;

  const episodes = body.episodes_detail.map((e) => ({
    run_id: runId,
    condition_id: row.id,
    project_id: projectId,
    seed: e.seed,
    success: e.success,
    steps: e.steps,
    max_reward: e.max_reward,
    duration_s: e.duration_s ?? null,
    failure_label: e.failure_label ?? null,
    first_divergence_step: e.first_divergence_step ?? null,
    nominal_success: e.nominal_success ?? null,
    contacts: e.contacts,
    video_path: pathFor(e.video),
    trace_path: pathFor(e.trace),
    error: e.error ?? null,
  }));

  for (let i = 0; i < episodes.length; i += 500) {
    const { error: epError } = await admin
      .from("episodes")
      .upsert(episodes.slice(i, i + 500), { onConflict: "condition_id,seed" });
    if (epError) {
      console.error("insert episodes", epError);
      throw new ApiError(500, "Could not store the episodes.");
    }
  }
  return { conditionId: row.id, episodes: episodes.length };
}
