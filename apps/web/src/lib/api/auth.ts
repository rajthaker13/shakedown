import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { brand } from "@/lib/brand";
import { allow } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

import { ApiError } from "./errors";

export { ApiError };

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Create a new key. The full key is returned once and only its hash is stored. */
export function generateKey(): { key: string; prefix: string; hash: string } {
  const key = `${brand.keyPrefix}${randomBytes(24).toString("hex")}`;
  return { key, prefix: key.slice(0, brand.keyPrefix.length + 6), hash: hashKey(key) };
}

export type ApiContext = {
  keyId: string;
  project: { id: string; slug: string; name: string; org_id: string };
  org: { slug: string };
};

/** Resolve the project a request may write to from its bearer key. */
export async function authenticate(request: Request): Promise<ApiContext> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) {
    throw new ApiError(401, "Missing API key. Send it as: Authorization: Bearer <key>");
  }
  const key = match[1];
  if (!key.startsWith(brand.keyPrefix)) {
    throw new ApiError(401, "That does not look like a Shakedown API key.");
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("api_keys")
    .select("id, revoked_at, projects (id, slug, name, org_id, orgs (slug))")
    .eq("hash", hashKey(key))
    .maybeSingle();
  if (error) throw new ApiError(500, "Could not verify the API key.");
  if (!data || !data.projects) throw new ApiError(401, "Unknown API key.");
  if (data.revoked_at) throw new ApiError(401, "This API key has been revoked.");
  if (!(await allow(`key:${data.id}`, 1200, 60))) {
    throw new ApiError(429, "Too many requests with this key. Wait a minute and try again.");
  }

  // Best effort: a failure to record usage must not fail the request.
  void admin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => undefined);

  const project = data.projects;
  return {
    keyId: data.id,
    project: { id: project.id, slug: project.slug, name: project.name, org_id: project.org_id },
    org: { slug: project.orgs.slug },
  };
}

type Handler<C> = (request: Request, api: ApiContext, context: C) => Promise<Response>;

/** Wrap a route handler with key authentication and uniform error responses. */
export function withApiKey<C>(handler: Handler<C>) {
  return async (request: Request, context: C): Promise<Response> => {
    try {
      const api = await authenticate(request);
      return await handler(request, api, context);
    } catch (err) {
      if (err instanceof ApiError) {
        return Response.json({ error: err.message }, { status: err.status });
      }
      console.error("api error", err);
      return Response.json({ error: "Internal error." }, { status: 500 });
    }
  };
}

export async function readJson(request: Request, maxBytes = 8 * 1024 * 1024): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) throw new ApiError(413, "Request body is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "Request body is not valid JSON.");
  }
}

/** Load a run and confirm it belongs to the key's project. */
export async function requireRun(api: ApiContext, runId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) throw new ApiError(404, "Run not found.");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("runs")
    .select("id, number, status, project_id")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new ApiError(500, "Could not load the run.");
  if (!data || data.project_id !== api.project.id) throw new ApiError(404, "Run not found.");
  return data;
}
