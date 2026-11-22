import { ApiError, readJson, requireRun, withApiKey } from "@/lib/api/auth";
import { parse, runFooter } from "@/lib/api/schema";
import { siteUrl } from "@/lib/brand";
import type { Json } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

export const POST = withApiKey(
  async (request, api, context: RouteContext<"/api/v1/runs/[id]/complete">) => {
    const { id } = await context.params;
    const run = await requireRun(api, id);
    const body = parse(runFooter, await readJson(request));

    const admin = createAdminClient();
    const { error } = await admin
      .from("runs")
      .update({
        status: body.verdict === "ERROR" ? "failed" : "completed",
        verdict: body.verdict,
        summary: body.summary as Json,
        finished_at: body.finished_at,
        duration_s: body.duration_s,
      })
      .eq("id", run.id);
    if (error) {
      console.error("complete run", error);
      throw new ApiError(500, "Could not complete the run.");
    }
    return Response.json({
      run_id: run.id,
      number: run.number,
      url: `${siteUrl}/app/${api.org.slug}/${api.project.slug}/runs/${run.number}`,
    });
  },
);
