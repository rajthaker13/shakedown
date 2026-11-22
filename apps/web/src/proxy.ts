import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import ws from "ws";

/**
 * Keeps the Supabase session fresh. Access control is not decided here:
 * pages check the user themselves and the database enforces row level security.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    realtime: { transport: ws as unknown as typeof WebSocket },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        for (const { name, value } of items) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of items) response.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Pages that can show signed-in state. The CLI API authenticates with keys, not cookies.
  matcher: ["/app/:path*", "/login", "/signup", "/forgot", "/reset", "/auth/:path*", "/api/cloud/:path*", "/api/artifacts/:path*", "/api/explain"],
};
