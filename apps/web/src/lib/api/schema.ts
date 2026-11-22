import { z } from "zod";

import { ApiError } from "./errors";

export const ARTIFACT_BUCKET = "artifacts";

const verdict = z.enum(["PASS", "WARN", "FAIL", "SKIP", "ERROR"]);

export const runHeader = z.object({
  id: z.uuid().optional(),
  schema: z.literal(1),
  engine_version: z.string().max(40),
  suite: z.string().min(1).max(120),
  policy: z.object({
    label: z.string().min(1).max(120),
    spec: z.string().max(500).default(""),
    info: z.record(z.string(), z.unknown()).default({}),
  }),
  git: z
    .object({
      sha: z.string().max(80).nullish(),
      branch: z.string().max(200).nullish(),
      message: z.string().max(500).nullish(),
      dirty: z.boolean().nullish(),
      repository: z.string().max(200).nullish(),
      pull_request: z.number().int().nullish(),
    })
    .default({}),
  host: z.record(z.string(), z.unknown()).default({}),
  started_at: z.iso.datetime({ offset: true }),
  baseline: z
    .object({ run_id: z.string().nullish(), label: z.string().max(120).nullish() })
    .nullish(),
  planned: z
    .array(
      z.object({
        key: z.string().max(200),
        label: z.string().max(300),
        scenario: z.string().max(200),
        episodes: z.number().int().nonnegative(),
      }),
    )
    .max(2000)
    .default([]),
});

const episode = z.object({
  seed: z.number().int(),
  success: z.boolean(),
  steps: z.number().int().nonnegative(),
  max_reward: z.number(),
  duration_s: z.number().nullish(),
  failure_label: z.string().max(500).nullish(),
  first_divergence_step: z.number().int().nullish(),
  nominal_success: z.boolean().nullish(),
  contacts: z.record(z.string(), z.number()).default({}),
  video: z.string().max(300).nullish(),
  trace: z.string().max(300).nullish(),
  error: z.string().max(4000).nullish(),
});

export const condition = z.object({
  key: z.string().min(1).max(200),
  scenario: z.string().min(1).max(200),
  label: z.string().min(1).max(300),
  description: z.string().max(2000).default(""),
  env: z.string().max(120),
  backend: z.string().max(60).default(""),
  sweep_name: z.string().max(120).nullish(),
  sweep_value: z.union([z.string(), z.number()]).nullish(),
  tags: z.array(z.string().max(60)).max(30).default([]),
  perturbations: z.array(z.record(z.string(), z.unknown())).max(50).default([]),
  perturbation_summary: z.array(z.string().max(500)).max(50).default([]),
  fingerprint: z.string().max(64),
  episodes: z.number().int().nonnegative(),
  successes: z.number().int().nonnegative(),
  success_rate: z.number().min(0).max(1),
  ci_low: z.number().min(0).max(1),
  ci_high: z.number().min(0).max(1),
  mean_steps_success: z.number().nullish(),
  contacts: z.record(z.string(), z.number()).default({}),
  failure_labels: z.record(z.string(), z.number()).default({}),
  verdict,
  checks: z
    .array(
      z.object({
        name: z.string().max(60),
        verdict,
        message: z.string().max(1000),
        detail: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .max(20)
    .default([]),
  comparison: z.record(z.string(), z.unknown()).nullish(),
  outcomes: z.record(z.string(), z.boolean()).default({}),
  duration_s: z.number().nullish(),
  scenario_source: z.string().max(20000).default(""),
  error: z.string().max(4000).nullish(),
  episodes_detail: z.array(episode).max(100000).default([]),
});

export const runFooter = z.object({
  finished_at: z.iso.datetime({ offset: true }),
  duration_s: z.number().nonnegative(),
  verdict,
  summary: z.record(z.string(), z.unknown()).default({}),
});

export const artifactRequest = z.object({
  paths: z.array(z.string().max(300)).min(1).max(100),
});

export const realTrials = z.object({
  suite: z.string().min(1).max(120),
  policy_label: z.string().min(1).max(120),
  robot: z.string().max(120).default(""),
  trials: z
    .array(
      z.object({
        condition_key: z.string().min(1).max(200),
        trial: z.number().int().nonnegative(),
        success: z.boolean(),
        operator: z.string().max(120).default(""),
        notes: z.string().max(2000).default(""),
        recorded_at: z.iso.datetime({ offset: true }).optional(),
      }),
    )
    .min(1)
    .max(5000),
});

export const fieldEpisodes = z.object({
  episodes: z
    .array(
      z.object({
        id: z.string().min(1).max(120),
        policy_label: z.string().min(1).max(120),
        release: z.number().int().positive().nullish(),
        robot: z.string().max(120).default(""),
        site: z.string().max(120).default(""),
        success: z.boolean(),
        intervention: z.boolean().default(false),
        intervention_reason: z.string().max(500).default(""),
        note: z.string().max(2000).default(""),
        steps: z.number().int().nonnegative().nullish(),
        duration_s: z.number().nonnegative().nullish(),
        measured: z
          .object({
            action_delay_ms: z.number().nonnegative().optional(),
            inference_ms: z.number().nonnegative().optional(),
            control_hz: z.number().positive().optional(),
            image_brightness: z.number().min(0).max(255).optional(),
            frames_dropped: z.number().int().nonnegative().optional(),
          })
          .default({}),
        simulated: z.boolean().default(false),
        started_at: z.iso.datetime({ offset: true }).optional(),
      }),
    )
    .min(1)
    .max(1000),
});

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue.path.length ? ` at ${issue.path.join(".")}` : "";
    throw new ApiError(400, `Invalid request${where}: ${issue.message}`);
  }
  return result.data;
}

/**
 * Artifact paths come from the client, so they are restricted to the layout
 * the engine writes. This keeps one run from writing into another's folder.
 */
const ARTIFACT_PATH = /^episodes\/[A-Za-z0-9._@-]{1,200}\/[0-9]{1,12}\.(json|mp4)$/;

export function isArtifactPath(path: string): boolean {
  return ARTIFACT_PATH.test(path) && !path.includes("..");
}

export function storagePath(projectId: string, runId: string, relative: string): string {
  return `${projectId}/${runId}/${relative}`;
}
