import "server-only";

import { createClient } from "@supabase/supabase-js";
import ws from "ws";

import type { Database } from "@/lib/database.types";

import { supabaseServiceKey, supabaseUrl } from "./env";

let client: ReturnType<typeof createClient<Database>> | undefined;

/**
 * Service-role client. Bypasses row level security, so every caller must
 * have already established what the request is allowed to touch.
 */
export function createAdminClient() {
  client ??= createClient<Database>(supabaseUrl(), supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    // Node versions before 22 have no built-in WebSocket, which the client needs at construction.
    realtime: { transport: ws as unknown as typeof WebSocket },
  });
  return client;
}
