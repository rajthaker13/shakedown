import "server-only";

import { ARTIFACT_BUCKET } from "@/lib/api/schema";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Artifacts live in a private bucket. Callers must first confirm, through a
 * query made as the viewer, that the viewer may read the episode the artifact
 * belongs to. Only then is a path passed to these functions.
 */
export async function signedUrl(path: string, expiresInSeconds = 3600): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .storage.from(ARTIFACT_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}

export type Trace = {
  seed: number;
  success: boolean;
  steps: number;
  max_reward: number;
  fps: number;
  frame_stride: number;
  signals: Record<string, number[]>;
  contacts: Record<string, number>;
  first_divergence_step: number | null;
  failure_label: string | null;
};

export async function downloadTrace(path: string): Promise<Trace | null> {
  const { data, error } = await createAdminClient().storage.from(ARTIFACT_BUCKET).download(path);
  if (error || !data) return null;
  try {
    const raw = JSON.parse(await data.text());
    return {
      seed: raw.seed,
      success: raw.success,
      steps: raw.steps,
      max_reward: raw.max_reward,
      fps: typeof raw.fps === "number" ? raw.fps : 50,
      frame_stride: typeof raw.frame_stride === "number" ? raw.frame_stride : 2,
      signals: raw.signals ?? {},
      contacts: raw.contacts ?? {},
      first_divergence_step: raw.first_divergence_step ?? null,
      failure_label: raw.failure_label ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Remove every stored file of a run. Storage is not linked to the database,
 * so deleting a run's rows does not remove its videos and traces.
 */
export async function removeRunArtifacts(projectId: string, runId: string): Promise<number> {
  const bucket = createAdminClient().storage.from(ARTIFACT_BUCKET);
  const root = `${projectId}/${runId}/episodes`;
  let removed = 0;
  // Conditions are folders under the run; episodes are files under a condition.
  for (;;) {
    const { data: folders, error } = await bucket.list(root, { limit: 1000 });
    if (error || !folders?.length) return removed;
    let found = 0;
    for (const folder of folders) {
      for (;;) {
        const { data: files } = await bucket.list(`${root}/${folder.name}`, { limit: 1000 });
        if (!files?.length) break;
        const paths = files.map((file) => `${root}/${folder.name}/${file.name}`);
        const { error: removeError } = await bucket.remove(paths);
        if (removeError) return removed;
        removed += paths.length;
        found += paths.length;
      }
    }
    // Empty folders are not real objects; once no files remain there is nothing left to list.
    if (found === 0) return removed;
  }
}
