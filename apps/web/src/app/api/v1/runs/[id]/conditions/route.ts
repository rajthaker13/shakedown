import { ApiError, readJson, requireRun, withApiKey } from "@/lib/api/auth";
import { condition, parse } from "@/lib/api/schema";
import { ingestCondition } from "@/lib/ingest";

export const POST = withApiKey(
  async (request, api, context: RouteContext<"/api/v1/runs/[id]/conditions">) => {
    const { id } = await context.params;
    const run = await requireRun(api, id);
    if (run.status !== "running") {
      throw new ApiError(409, `Run #${run.number} is ${run.status}; it accepts no more results.`);
    }
    const body = parse(condition, await readJson(request));
    const stored = await ingestCondition(api.project.id, run.id, body);
    return Response.json(
      { condition_id: stored.conditionId, episodes: stored.episodes },
      { status: 201 },
    );
  },
);
