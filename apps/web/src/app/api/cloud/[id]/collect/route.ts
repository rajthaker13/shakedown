import { NextResponse } from "next/server";

import { CloudError, collectJob } from "@/lib/cloud";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

/**
 * Pull finished conditions of a cloud run into the database. Called by the
 * run page while the run is in progress. Anyone who may read the run may
 * trigger it: it only copies results that already exist.
 */
export async function POST(_request: Request, context: RouteContext<"/api/cloud/[id]/collect">) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const supabase = await createClient();
  const { data: job } = await supabase.from("hosted_jobs").select("id").eq("id", id).maybeSingle();
  if (!job) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    return NextResponse.json(await collectJob(id));
  } catch (error) {
    if (error instanceof CloudError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
