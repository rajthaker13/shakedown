import { withApiKey } from "@/lib/api/auth";

export const GET = withApiKey(async (_request, api) =>
  Response.json({
    project: api.project.slug,
    project_name: api.project.name,
    org: api.org.slug,
  }),
);
