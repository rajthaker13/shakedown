import { ApiError, readJson, withApiKey } from "@/lib/api/auth";
import { fieldEpisodes, parse } from "@/lib/api/schema";
import { refreshSuggestions } from "@/lib/pipeline/data";
import { createAdminClient } from "@/lib/supabase/admin";

/** Attempts reported by robots. Sending the same report twice stores it once. */
export const POST = withApiKey(async (request, api) => {
  const body = parse(fieldEpisodes, await readJson(request));
  const admin = createAdminClient();

  const numbers = [...new Set(body.episodes.map((e) => e.release).filter((n) => n != null))];
  const releases = new Map<number, string>();
  if (numbers.length) {
    const { data } = await admin
      .from("releases")
      .select("id, number")
      .eq("project_id", api.project.id)
      .in("number", numbers as number[]);
    for (const r of data ?? []) releases.set(r.number, r.id);
    const unknown = numbers.find((n) => !releases.has(n as number));
    if (unknown != null) throw new ApiError(400, `This project has no release #${unknown}.`);
  }

  const rows = body.episodes.map((e) => ({
    project_id: api.project.id,
    release_id: e.release != null ? (releases.get(e.release) ?? null) : null,
    external_id: e.id,
    policy_label: e.policy_label,
    robot: e.robot,
    site: e.site,
    success: e.success,
    intervention: e.intervention,
    intervention_reason: e.intervention_reason,
    note: e.note,
    steps: e.steps ?? null,
    duration_s: e.duration_s ?? null,
    measured: e.measured,
    simulated: e.simulated,
    ...(e.started_at ? { started_at: e.started_at } : {}),
  }));
  const { error } = await admin
    .from("field_episodes")
    .upsert(rows, { onConflict: "project_id,external_id" });
  if (error) {
    console.error("insert field episodes", error);
    throw new ApiError(500, "Could not store the reports.");
  }
  const suggestions = await refreshSuggestions(api.project.id).catch(() => 0);
  return Response.json({ stored: rows.length, new_suggestions: suggestions }, { status: 201 });
});
