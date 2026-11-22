import "server-only";

import type { Verdict } from "@/components/ui/status";
import { conditionChecks, projectSettings, type Project } from "@/lib/data";
import type { Database, Json } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import {
  fieldGate,
  testGate,
  type FieldEvidence,
  type GateCheck,
  type GateSettings,
  type RunEvidence,
} from "./gates";
import { coverage, suggest, type FieldRow, type Measured } from "./suggest";

type Tables = Database["public"]["Tables"];
export type Release = Tables["releases"]["Row"];
export type ReleaseEvent = Tables["release_events"]["Row"];
export type FieldEpisode = Tables["field_episodes"]["Row"];
export type Suggestion = Tables["scenario_suggestions"]["Row"];
export type Stage = Release["stage"];

/** Control rate of each bundled environment family, for converting delay into steps. */
const CONTROL_HZ: Record<string, number> = { aloha: 50, pusht: 10 };

export function gateSettings(project: Pick<Project, "settings">): GateSettings {
  const raw = (project.settings ?? {}) as Partial<GateSettings>;
  const n = (v: unknown, fallback: number) => (typeof v === "number" ? v : fallback);
  return {
    min_episodes: projectSettings(project).min_episodes,
    min_field_episodes: n(raw.min_field_episodes, 30),
    max_field_drop_pts: n(raw.max_field_drop_pts, 10),
  };
}

export async function listReleases(projectId: string): Promise<Release[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("releases")
    .select("*")
    .eq("project_id", projectId)
    .order("number", { ascending: false });
  if (error) throw new Error(`Could not load releases: ${error.message}`);
  return data ?? [];
}

export async function listReleaseEvents(projectId: string): Promise<ReleaseEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("release_events")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(200);
  return data ?? [];
}

export async function listFieldEpisodes(projectId: string, limit = 5000): Promise<FieldEpisode[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("field_episodes")
    .select("*")
    .eq("project_id", projectId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load field reports: ${error.message}`);
  return data ?? [];
}

export async function listSuggestions(projectId: string): Promise<Suggestion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("scenario_suggestions")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** Reports from hardware only. A simulated stand-in is not evidence about a robot. */
export function fromHardware<T extends Pick<FieldEpisode, "simulated">>(episodes: T[]): T[] {
  return episodes.filter((e) => !e.simulated);
}

export function tally(episodes: Pick<FieldEpisode, "success" | "intervention">[]): FieldEvidence {
  return {
    episodes: episodes.length,
    successes: episodes.filter((e) => e.success).length,
    interventions: episodes.filter((e) => e.intervention).length,
  };
}

/** The evidence a release's test gate looks at. Uses the caller's client. */
export async function runEvidence(
  client: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>,
  runId: string | null,
): Promise<RunEvidence> {
  if (!runId) return null;
  const [{ data: run }, { data: conditions }] = await Promise.all([
    client.from("runs").select("status, verdict, baseline_label").eq("id", runId).maybeSingle(),
    client.from("run_conditions").select("key, verdict, episodes, checks").eq("run_id", runId),
  ]);
  if (!run) return null;
  return {
    status: run.status,
    verdict: run.verdict as Verdict | null,
    hasBaseline: Boolean(run.baseline_label),
    conditions: (conditions ?? []).map((c) => ({
      key: c.key,
      verdict: c.verdict as Verdict,
      episodes: c.episodes,
      regression: conditionChecks(c).some((ch) => ch.name === "regression" && ch.verdict === "FAIL"),
    })),
  };
}

/** The checks a release must pass to reach the next stage, with their current outcome. */
export async function gateFor(
  project: Project,
  release: Release,
  all: Release[],
  field: FieldEpisode[],
): Promise<{ to: Stage; checks: GateCheck[] } | null> {
  const settings = gateSettings(project);
  if (release.stage === "candidate") {
    const supabase = await createClient();
    return { to: "canary", checks: testGate(await runEvidence(supabase, release.run_id), settings) };
  }
  if (release.stage === "canary") {
    const fleet = all.find((r) => r.stage === "fleet");
    field = fromHardware(field);
    return {
      to: "fleet",
      checks: fieldGate(
        tally(field.filter((e) => e.release_id === release.id)),
        fleet
          ? { ...tally(field.filter((e) => e.release_id === fleet.id)), label: `#${fleet.number}` }
          : null,
        settings,
      ),
    };
  }
  return null;
}

/**
 * Compare the field with what the suite covers and record any new proposals.
 * Runs after robots report. A proposal that was dismissed is not made again.
 */
export async function refreshSuggestions(projectId: string): Promise<number> {
  const admin = createAdminClient();
  const { data: latest } = await admin
    .from("runs")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return 0;
  const [{ data: conditions }, { data: episodes }] = await Promise.all([
    admin.from("run_conditions").select("env, perturbations").eq("run_id", latest.id),
    admin
      .from("field_episodes")
      .select("success, steps, measured")
      .eq("project_id", projectId)
      .order("started_at", { ascending: false })
      .limit(2000),
  ]);
  const rows: FieldRow[] = (episodes ?? []).map((e) => ({
    success: e.success,
    steps: e.steps,
    measured: (e.measured ?? {}) as Measured,
  }));
  const env = conditions?.[0]?.env ?? "";
  const proposals = suggest(rows, coverage(conditions ?? [], CONTROL_HZ[env.split("/")[0]] ?? 50));
  if (!proposals.length) return 0;
  const { data: inserted } = await admin
    .from("scenario_suggestions")
    .upsert(
      proposals.map((p) => ({
        project_id: projectId,
        fingerprint: p.fingerprint,
        title: p.title,
        rationale: p.rationale,
        yaml: p.yaml,
        evidence: p.evidence as Json,
      })),
      { onConflict: "project_id,fingerprint", ignoreDuplicates: true },
    )
    .select("id");
  return inserted?.length ?? 0;
}
