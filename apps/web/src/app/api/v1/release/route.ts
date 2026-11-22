import { ApiError, withApiKey } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * What a robot should run. `channel=fleet` gives the release approved for
 * every robot; `channel=canary` gives the release on trial, or the fleet
 * release when none is.
 */
export const GET = withApiKey(async (request, api) => {
  const channel = new URL(request.url).searchParams.get("channel") ?? "fleet";
  if (channel !== "fleet" && channel !== "canary") {
    throw new ApiError(400, "channel must be fleet or canary");
  }
  const admin = createAdminClient();
  const stages = channel === "canary" ? (["canary", "fleet"] as const) : (["fleet"] as const);
  for (const stage of stages) {
    const { data, error } = await admin
      .from("releases")
      .select("number, stage, policy_label, policy_spec, runtime_config, stage_changed_at")
      .eq("project_id", api.project.id)
      .eq("stage", stage)
      .order("stage_changed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new ApiError(500, "Could not look up the release.");
    if (data) return Response.json({ channel, release: data });
  }
  return Response.json({ channel, release: null });
});
