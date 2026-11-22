import { ApiError, withApiKey } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The latest completed run of a suite on a branch, in the shape the engine
 * reads as a baseline.
 */
export const GET = withApiKey(async (request, api) => {
  const params = new URL(request.url).searchParams;
  const suite = params.get("suite");
  if (!suite) throw new ApiError(400, "Missing query parameter: suite");
  const branch = params.get("branch");

  const admin = createAdminClient();
  let query = admin
    .from("runs")
    .select("id, policy_label, suite, git_branch, number")
    .eq("project_id", api.project.id)
    .eq("suite", suite)
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(1);
  if (branch) query = query.eq("git_branch", branch);

  const { data: runs, error } = await query;
  if (error) throw new ApiError(500, "Could not look up the baseline.");
  const run = runs?.[0];
  if (!run) return Response.json({ result: null });

  const { data: conditions, error: condError } = await admin
    .from("run_conditions")
    .select("key, fingerprint, outcomes")
    .eq("run_id", run.id);
  if (condError) throw new ApiError(500, "Could not load the baseline.");

  return Response.json({
    result: {
      schema: 1,
      id: run.id,
      number: run.number,
      suite: run.suite,
      policy: { label: run.policy_label },
      conditions: conditions ?? [],
    },
  });
});
