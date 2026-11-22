import { NextResponse } from "next/server";

import { downloadTrace } from "@/lib/artifacts";
import { explainAvailable, explainFailure } from "@/lib/explain";
import { allow } from "@/lib/rate-limit";
import { createClient, getUser } from "@/lib/supabase/server";

export const maxDuration = 120;

/**
 * Explain one failed episode. Each call costs money, so it is limited to
 * signed-in members of the organization that owns the project. Viewers of a
 * public project cannot trigger it.
 */
export async function POST(request: Request) {
  if (!explainAvailable()) {
    return NextResponse.json(
      { error: "Explanations are not configured on this server." },
      { status: 503 },
    );
  }
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 });

  if (!(await allow(`explain:${user.id}`, 30, 3600))) {
    return NextResponse.json(
      { error: "You have asked for many explanations this hour. Try again later." },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => null)) as { episode?: unknown } | null;
  const id = typeof body?.episode === "string" ? body.episode : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: episode } = await supabase
    .from("episodes")
    .select("*, run_conditions (*), runs (policy_label)")
    .eq("id", id)
    .maybeSingle();
  if (!episode || !episode.run_conditions || !episode.runs) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data: canWrite } = await supabase.rpc("can_write_project", {
    target_project: episode.project_id,
  });
  if (!canWrite) {
    return NextResponse.json(
      { error: "Only members of this project's organization can request explanations." },
      { status: 403 },
    );
  }
  if (episode.success || !episode.trace_path) {
    return NextResponse.json({ error: "Only failed episodes with a trace can be explained." }, { status: 400 });
  }

  const condition = episode.run_conditions;
  const trace = await downloadTrace(episode.trace_path);
  if (!trace) return NextResponse.json({ error: "The trace is not available." }, { status: 404 });

  // The same seed without perturbation, from the same run.
  const { data: siblings } = await supabase
    .from("run_conditions")
    .select("id, perturbation_summary")
    .eq("run_id", episode.run_id)
    .eq("env", condition.env)
    .neq("id", condition.id);
  const nominalCondition = (siblings ?? []).find((c) => c.perturbation_summary.length === 0);
  let nominal = null;
  if (nominalCondition) {
    const { data: ref } = await supabase
      .from("episodes")
      .select("trace_path")
      .eq("condition_id", nominalCondition.id)
      .eq("seed", episode.seed)
      .maybeSingle();
    if (ref?.trace_path) nominal = await downloadTrace(ref.trace_path);
  }

  const result = await explainFailure({
    policy: episode.runs.policy_label,
    env: condition.env,
    conditionLabel: condition.label,
    conditionDescription: condition.description,
    perturbations: condition.perturbation_summary,
    failureLabel: episode.failure_label,
    conditionRate: condition.success_rate,
    conditionEpisodes: condition.episodes,
    trace,
    nominal,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ text: result.text, model: result.model });
}
