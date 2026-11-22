import { ApiError, readJson, withApiKey } from "@/lib/api/auth";
import { parse, realTrials } from "@/lib/api/schema";
import { createAdminClient } from "@/lib/supabase/admin";

/** Record outcomes observed on a real robot. */
export const POST = withApiKey(async (request, api) => {
  const body = parse(realTrials, await readJson(request));
  const admin = createAdminClient();
  const rows = body.trials.map((t) => ({
    project_id: api.project.id,
    suite: body.suite,
    policy_label: body.policy_label,
    robot: body.robot,
    condition_key: t.condition_key,
    trial: t.trial,
    success: t.success,
    operator: t.operator,
    notes: t.notes,
    ...(t.recorded_at ? { recorded_at: t.recorded_at } : {}),
  }));
  const { error } = await admin
    .from("real_trials")
    .upsert(rows, { onConflict: "project_id,suite,condition_key,policy_label,robot,trial" });
  if (error) {
    console.error("insert real trials", error);
    throw new ApiError(500, "Could not store the trials.");
  }
  return Response.json({ stored: rows.length }, { status: 201 });
});
