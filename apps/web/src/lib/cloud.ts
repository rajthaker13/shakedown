import "server-only";

import { ARTIFACT_BUCKET, condition as conditionSchema, isArtifactPath, storagePath } from "@/lib/api/schema";
import type { Json } from "@/lib/database.types";
import { ingestCondition } from "@/lib/ingest";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Suites the cloud runner has scenes for, and the kind of model each accepts.
 * Only suites that have completed on the cloud are offered. PushT is left out:
 * it runs locally but has not finished on the cloud runner.
 */
export const HOSTED_SUITES = [
  {
    id: "aloha-transfer-cube",
    name: "ALOHA transfer cube",
    conditions: 19,
    accepts: "Policies trained on the simulated ALOHA transfer-cube task",
    example: "lerobot/act_aloha_sim_transfer_cube_human",
  },
  {
    id: "aloha-insertion-latency",
    name: "ALOHA peg insertion, delay only",
    conditions: 4,
    accepts: "Policies trained on the simulated ALOHA insertion task",
    example: "lerobot/act_aloha_sim_insertion_human",
  },
  {
    id: "aloha-latency",
    name: "ALOHA transfer cube, delay only",
    conditions: 6,
    accepts: "The same policies, tested against action delay alone",
    example: "lerobot/act_aloha_sim_transfer_cube_human",
  },
] as const;

export const MAX_HOSTED_EPISODES = 50;
/** Simulated episodes one account may run on the cloud in a calendar month. */
export const MONTHLY_EPISODE_ALLOWANCE = 5000;

export const MODEL_ID = /^[A-Za-z0-9][\w.-]{0,95}\/[\w.-]{1,96}$/;

export function cloudConfigured(): boolean {
  return Boolean(process.env.SHAKEDOWN_CLOUD_URL && process.env.SHAKEDOWN_CLOUD_TOKEN);
}

export class CloudError extends Error {}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const base = process.env.SHAKEDOWN_CLOUD_URL?.replace(/\/$/, "");
  if (!base || !process.env.SHAKEDOWN_CLOUD_TOKEN) {
    throw new CloudError("Cloud runs are not configured on this server.");
  }
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.SHAKEDOWN_CLOUD_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new CloudError("The cloud runner could not be reached.");
  }
  if (!response.ok) {
    const detail = await response
      .json()
      .then((d) => (typeof d?.detail === "string" ? d.detail : ""))
      .catch(() => "");
    throw new CloudError(detail || `The cloud runner returned ${response.status}.`);
  }
  return (await response.json()) as T;
}

type Status = {
  state: "queued" | "running" | "completed" | "failed";
  done: string[];
  error?: string;
  planned?: { key: string; label: string; scenario: string; episodes: number }[];
};

type Summary = {
  verdict: "PASS" | "WARN" | "FAIL" | "SKIP" | "ERROR";
  summary: Record<string, unknown>;
  finished_at: string;
  duration_s: number;
  policy: { info: Record<string, unknown> };
  host: Record<string, unknown>;
  engine_version: string;
};

type ConditionPayload = {
  condition: unknown;
  files: { path: string; content_type: string; data: string }[];
};

export async function startJob(job: {
  id: string;
  policy: string;
  suite: string;
  label: string;
  episodes: number;
  baseline: unknown;
}): Promise<void> {
  await call("POST", "/jobs", {
    job_id: job.id,
    policy: job.policy,
    suite: job.suite,
    label: job.label,
    episodes: job.episodes,
    baseline: job.baseline,
  });
}

/**
 * Copy whatever the runner has finished since the last call into the
 * database and storage. Safe to call repeatedly and concurrently: conditions
 * and files are written with upserts.
 */
export async function collectJob(jobId: string): Promise<{ state: Status["state"]; collected: number }> {
  const admin = createAdminClient();
  const { data: job } = await admin.from("hosted_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) throw new CloudError("No such cloud run.");
  if (job.state === "completed" || job.state === "failed") return { state: job.state, collected: 0 };

  const status = await call<Status>("GET", `/jobs/${jobId}`);

  if (status.planned?.length && job.conditions !== status.planned.length) {
    await admin.from("hosted_jobs").update({ conditions: status.planned.length }).eq("id", jobId);
    await admin.from("runs").update({ planned: status.planned as Json }).eq("id", jobId);
  }

  const seen = new Set(job.ingested);
  let collected = 0;
  // A few at a time: each condition carries its videos.
  for (const key of status.done.filter((k) => !seen.has(k)).slice(0, 4)) {
    const payload = await call<ConditionPayload>(
      "GET",
      `/jobs/${jobId}/conditions/${encodeURIComponent(key)}`,
    );
    const parsed = conditionSchema.safeParse(payload.condition);
    if (!parsed.success) {
      throw new CloudError(`The runner returned a condition this server cannot read (${key}).`);
    }
    for (const file of payload.files) {
      if (!isArtifactPath(file.path)) continue;
      const { error } = await admin.storage
        .from(ARTIFACT_BUCKET)
        .upload(storagePath(job.project_id, jobId, file.path), Buffer.from(file.data, "base64"), {
          contentType: file.content_type === "video/mp4" ? "video/mp4" : "application/json",
          upsert: true,
        });
      if (error) throw new CloudError(`Could not store ${file.path}.`);
    }
    await ingestCondition(job.project_id, jobId, parsed.data);
    seen.add(key);
    collected += 1;
    await admin.from("hosted_jobs").update({ ingested: [...seen], state: "running" }).eq("id", jobId);
  }

  const everything = status.done.every((k) => seen.has(k));
  if (status.state === "failed") {
    const now = new Date().toISOString();
    await admin
      .from("hosted_jobs")
      .update({ state: "failed", error: status.error ?? "The run failed.", finished_at: now })
      .eq("id", jobId);
    await admin.from("runs").update({ status: "failed", verdict: "ERROR", finished_at: now }).eq("id", jobId);
    return { state: "failed", collected };
  }
  if (status.state === "completed" && everything) {
    const result = await call<Summary>("GET", `/jobs/${jobId}/result`);
    await admin
      .from("runs")
      .update({
        status: "completed",
        verdict: result.verdict,
        summary: result.summary as Json,
        finished_at: result.finished_at,
        duration_s: result.duration_s,
        policy_info: result.policy.info as Json,
        host: result.host as Json,
        engine_version: result.engine_version,
      })
      .eq("id", jobId);
    await admin
      .from("hosted_jobs")
      .update({ state: "completed", finished_at: result.finished_at })
      .eq("id", jobId);
    return { state: "completed", collected };
  }
  if (job.state === "queued" && status.state === "running") {
    await admin.from("hosted_jobs").update({ state: "running" }).eq("id", jobId);
  }
  return { state: status.state === "completed" ? "running" : status.state, collected };
}

/** Episodes an account has asked the cloud for since the start of this month. */
export async function episodesUsedThisMonth(userId: string): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await createAdminClient()
    .from("hosted_jobs")
    .select("episodes, conditions, suite, state")
    .eq("requested_by", userId)
    .gte("created_at", start.toISOString());
  let total = 0;
  for (const job of data ?? []) {
    if (job.state === "failed") continue;
    const planned =
      job.conditions || HOSTED_SUITES.find((s) => s.id === job.suite)?.conditions || 0;
    total += planned * job.episodes;
  }
  return total;
}
