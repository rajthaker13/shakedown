import { ApiError, readJson, withApiKey } from "@/lib/api/auth";
import { parse, runHeader } from "@/lib/api/schema";
import { siteUrl } from "@/lib/brand";
import type { Json } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

export const POST = withApiKey(async (request, api) => {
  const body = parse(runHeader, await readJson(request));
  const admin = createAdminClient();

  // A baseline is only linked when it is a run in this same project.
  let baselineRunId: string | null = null;
  const claimed = body.baseline?.run_id;
  if (claimed && /^[0-9a-f-]{36}$/i.test(claimed)) {
    const { data } = await admin
      .from("runs")
      .select("id")
      .eq("id", claimed)
      .eq("project_id", api.project.id)
      .maybeSingle();
    baselineRunId = data?.id ?? null;
  }

  const { data, error } = await admin
    .from("runs")
    .insert({
      ...(body.id ? { id: body.id } : {}),
      project_id: api.project.id,
      suite: body.suite,
      policy_label: body.policy.label,
      policy_spec: body.policy.spec,
      policy_info: body.policy.info as Json,
      git_sha: body.git.sha ?? null,
      git_branch: body.git.branch ?? null,
      git_message: body.git.message ?? null,
      git_dirty: body.git.dirty ?? null,
      repository: body.git.repository ?? null,
      pull_request: body.git.pull_request ?? null,
      host: body.host as Json,
      engine_version: body.engine_version,
      status: "running",
      baseline_run_id: baselineRunId,
      baseline_label: body.baseline?.label ?? null,
      planned: body.planned as Json,
      started_at: body.started_at,
    })
    .select("id, number")
    .single();

  if (error?.code === "23505" && body.id) {
    // The same run uploaded again, for example after an interrupted upload.
    // Reopen it if it belongs to this project; its conditions are upserted.
    const { data: existing } = await admin
      .from("runs")
      .update({ status: "running", planned: body.planned as Json })
      .eq("id", body.id)
      .eq("project_id", api.project.id)
      .select("id, number")
      .maybeSingle();
    if (!existing) throw new ApiError(409, "A run with this id exists in another project.");
    return Response.json({
      run_id: existing.id,
      number: existing.number,
      url: `${siteUrl}/app/${api.org.slug}/${api.project.slug}/runs/${existing.number}`,
    });
  }
  if (error) {
    console.error("create run", error);
    throw new ApiError(500, "Could not create the run.");
  }

  return Response.json(
    {
      run_id: data.id,
      number: data.number,
      url: `${siteUrl}/app/${api.org.slug}/${api.project.slug}/runs/${data.number}`,
    },
    { status: 201 },
  );
});
