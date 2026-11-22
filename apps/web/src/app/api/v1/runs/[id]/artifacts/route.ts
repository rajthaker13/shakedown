import { ApiError, readJson, requireRun, withApiKey } from "@/lib/api/auth";
import { ARTIFACT_BUCKET, artifactRequest, isArtifactPath, parse, storagePath } from "@/lib/api/schema";
import { createAdminClient } from "@/lib/supabase/admin";

/** Hand out short-lived signed URLs so the CLI can upload straight to storage. */
export const POST = withApiKey(
  async (request, api, context: RouteContext<"/api/v1/runs/[id]/artifacts">) => {
    const { id } = await context.params;
    const run = await requireRun(api, id);
    const body = parse(artifactRequest, await readJson(request));

    const invalid = body.paths.find((p) => !isArtifactPath(p));
    if (invalid) throw new ApiError(400, `Not an artifact path: ${invalid}`);

    const admin = createAdminClient();
    const uploads = await Promise.all(
      body.paths.map(async (path) => {
        const { data, error } = await admin.storage
          .from(ARTIFACT_BUCKET)
          .createSignedUploadUrl(storagePath(api.project.id, run.id, path), { upsert: true });
        if (error || !data) {
          console.error("sign upload", error);
          throw new ApiError(500, `Could not prepare the upload of ${path}.`);
        }
        return { path, url: data.signedUrl };
      }),
    );
    return Response.json({ uploads });
  },
);
