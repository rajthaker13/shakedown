import { NextResponse, type NextRequest } from "next/server";

import { signedUrl } from "@/lib/artifacts";
import { createClient } from "@/lib/supabase/server";

/**
 * Redirects to a short-lived signed URL for an episode's video. The lookup is
 * made as the viewer, so row level security decides whether they may see it.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("episode") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const supabase = await createClient();
  const { data: episode } = await supabase
    .from("episodes")
    .select("video_path")
    .eq("id", id)
    .maybeSingle();
  if (!episode?.video_path) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const url = await signedUrl(episode.video_path);
  if (!url) return NextResponse.json({ error: "The video is not available." }, { status: 404 });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=300" } });
}
