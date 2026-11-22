import "server-only";

import { headers } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Count a hit and report whether it is allowed. If the limiter itself fails,
 * the request is let through: being unable to count is not a reason to
 * refuse service.
 */
export async function allow(bucket: string, max: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("hit_rate_limit", {
    target_bucket: bucket.slice(0, 200),
    max_hits: max,
    window_seconds: windowSeconds,
  });
  if (error) {
    console.error("rate limit", error.message);
    return true;
  }
  return data !== false;
}

/** The caller's address, as reported by the proxy in front of the app. */
export async function clientAddress(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
