import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import ws from "ws";

import type { Database } from "@/lib/database.types";

import { supabaseAnonKey, supabaseUrl } from "./env";

/** Supabase client acting as the signed-in user. Row level security applies. */
export async function createClient() {
  const store = await cookies();
  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    // Node versions before 22 have no built-in WebSocket, which the client needs at construction.
    realtime: { transport: ws as unknown as typeof WebSocket },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) => {
        try {
          for (const { name, value, options } of items) store.set(name, value, options);
        } catch {
          // Server Components cannot set cookies. The proxy refreshes the session instead.
        }
      },
    },
  });
}

/** The signed-in user, verified with the auth server. One lookup per request. */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});
