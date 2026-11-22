import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import type { Database } from "@/lib/database.types";
import { createClient, getUser } from "@/lib/supabase/server";

type Tables = Database["public"]["Tables"];
export type Org = Tables["orgs"]["Row"];
export type Project = Tables["projects"]["Row"];
export type Run = Tables["runs"]["Row"];
export type Condition = Tables["run_conditions"]["Row"];
export type Episode = Tables["episodes"]["Row"];
export type RealTrial = Tables["real_trials"]["Row"];
export type ApiKey = Pick<
  Tables["api_keys"]["Row"],
  "id" | "name" | "prefix" | "created_at" | "last_used_at" | "revoked_at"
>;

export type ProjectSettings = { noise_threshold_pts: number; min_episodes: number };

export function projectSettings(project: Pick<Project, "settings">): ProjectSettings {
  const raw = (project.settings ?? {}) as Partial<ProjectSettings>;
  return {
    noise_threshold_pts: typeof raw.noise_threshold_pts === "number" ? raw.noise_threshold_pts : 5,
    min_episodes: typeof raw.min_episodes === "number" ? raw.min_episodes : 20,
  };
}

export type RunSummary = {
  conditions: number;
  pass: number;
  warn: number;
  fail: number;
  skip: number;
  error: number;
  regressions: number;
  episodes: number;
  successes: number;
  success_rate: number;
};

export function runSummary(run: Pick<Run, "summary">): RunSummary {
  const raw = (run.summary ?? {}) as Partial<RunSummary>;
  const n = (v: unknown) => (typeof v === "number" ? v : 0);
  return {
    conditions: n(raw.conditions),
    pass: n(raw.pass),
    warn: n(raw.warn),
    fail: n(raw.fail),
    skip: n(raw.skip),
    error: n(raw.error),
    regressions: n(raw.regressions),
    episodes: n(raw.episodes),
    successes: n(raw.successes),
    success_rate: n(raw.success_rate),
  };
}

export type Check = {
  name: string;
  verdict: "PASS" | "WARN" | "FAIL" | "SKIP" | "ERROR";
  message: string;
  detail: Record<string, unknown>;
};

export function conditionChecks(condition: Pick<Condition, "checks">): Check[] {
  return Array.isArray(condition.checks) ? (condition.checks as unknown as Check[]) : [];
}

export type Planned = { key: string; label: string; scenario: string; episodes: number };

export function plannedConditions(run: Pick<Run, "planned">): Planned[] {
  return Array.isArray(run.planned) ? (run.planned as unknown as Planned[]) : [];
}

// ---------------------------------------------------------------------------

/** Organizations the signed-in user belongs to. */
export const getMyOrgs = cache(async (): Promise<(Org & { role: string })[]> => {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_members")
    .select("role, orgs (*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load organizations: ${error.message}`);
  return (data ?? []).filter((m) => m.orgs).map((m) => ({ ...m.orgs!, role: m.role }));
});

export type ProjectContext = {
  org: Pick<Org, "id" | "name" | "slug">;
  project: Project;
  /** True when the viewer belongs to the organization and may change things. */
  canWrite: boolean;
  signedIn: boolean;
};

/**
 * Resolve a project from its URL. Public projects are readable by anyone.
 * Anything the viewer may not read is reported as not found, so the URL
 * space does not reveal which projects exist.
 */
export const getProjectContext = cache(
  async (orgSlug: string, projectSlug: string): Promise<ProjectContext> => {
    const supabase = await createClient();
    const user = await getUser();
    const { data, error } = await supabase
      .from("projects")
      .select("*, orgs!inner (id, name, slug)")
      .eq("slug", projectSlug)
      .eq("orgs.slug", orgSlug)
      .maybeSingle();
    if (error) throw new Error(`Could not load the project: ${error.message}`);
    if (!data) {
      if (!user) redirect(`/login?next=/app/${orgSlug}/${projectSlug}`);
      notFound();
    }
    const { orgs, ...project } = data;
    const orgList = await getMyOrgs();
    return {
      org: orgs,
      project: project as Project,
      canWrite: orgList.some((o) => o.id === project.org_id),
      signedIn: Boolean(user),
    };
  },
);

export async function requireOrg(orgSlug: string) {
  const user = await getUser();
  if (!user) redirect(`/login?next=/app/${orgSlug}`);
  const orgs = await getMyOrgs();
  const org = orgs.find((o) => o.slug === orgSlug);
  if (!org) notFound();
  return org;
}

export async function listProjects(orgId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load projects: ${error.message}`);
  return data ?? [];
}

/** The most recent runs of each project, newest first, for the projects list. */
export async function recentRunsByProject(projectIds: string[], perProject = 20) {
  const out = new Map<string, Run[]>();
  if (!projectIds.length) return out;
  const supabase = await createClient();
  await Promise.all(
    projectIds.map(async (id) => {
      const { data, error } = await supabase
        .from("runs")
        .select("*")
        .eq("project_id", id)
        .order("started_at", { ascending: false })
        .limit(perProject);
      if (error) throw new Error(`Could not load runs: ${error.message}`);
      out.set(id, data ?? []);
    }),
  );
  return out;
}

export type RunFilters = {
  status?: string;
  branch?: string;
  policy?: string;
  suite?: string;
};

export async function listRuns(projectId: string, filters: RunFilters = {}, limit = 100) {
  const supabase = await createClient();
  let query = supabase
    .from("runs")
    .select("*")
    .eq("project_id", projectId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (filters.branch) query = query.eq("git_branch", filters.branch);
  if (filters.policy) query = query.eq("policy_label", filters.policy);
  if (filters.suite) query = query.eq("suite", filters.suite);
  if (filters.status === "running") query = query.eq("status", "running");
  else if (filters.status && ["PASS", "WARN", "FAIL", "ERROR"].includes(filters.status)) {
    query = query.eq("verdict", filters.status as "PASS" | "WARN" | "FAIL" | "ERROR");
  }
  const { data, error } = await query;
  if (error) throw new Error(`Could not load runs: ${error.message}`);
  return data ?? [];
}

export async function getRun(projectId: string, number: number) {
  if (!Number.isInteger(number) || number < 1) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("runs")
    .select("*")
    .eq("project_id", projectId)
    .eq("number", number)
    .maybeSingle();
  if (error) throw new Error(`Could not load the run: ${error.message}`);
  if (!data) notFound();
  return data;
}

export async function getRunById(runId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("runs").select("*").eq("id", runId).maybeSingle();
  return data;
}

export async function getConditions(runId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("run_conditions")
    .select("*")
    .eq("run_id", runId)
    .order("position", { ascending: true });
  if (error) throw new Error(`Could not load conditions: ${error.message}`);
  return data ?? [];
}

export async function getEpisodes(conditionId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("episodes")
    .select("*")
    .eq("condition_id", conditionId)
    .order("success", { ascending: true })
    .order("seed", { ascending: true });
  if (error) throw new Error(`Could not load episodes: ${error.message}`);
  return data ?? [];
}

export async function getEpisode(runId: string, conditionKey: string, seed: number) {
  const supabase = await createClient();
  const { data: condition } = await supabase
    .from("run_conditions")
    .select("*")
    .eq("run_id", runId)
    .eq("key", conditionKey)
    .maybeSingle();
  if (!condition) return null;
  const { data: episode } = await supabase
    .from("episodes")
    .select("*")
    .eq("condition_id", condition.id)
    .eq("seed", seed)
    .maybeSingle();
  if (!episode) return null;
  return { condition, episode };
}

export type MatrixColumn = { run: Run; conditions: Map<string, Condition> };
export type MatrixRow = {
  key: string;
  label: string;
  scenario: string;
  description: string;
  tags: string[];
  sweepName: string | null;
  sweepValue: string | null;
  perturbations: string[];
};

/**
 * The policy x condition matrix: the latest completed run of each policy
 * version for a suite, oldest version first.
 */
export async function getMatrix(projectId: string, suite?: string, maxColumns = 8) {
  const supabase = await createClient();
  const { data: runs, error } = await supabase
    .from("runs")
    .select("*")
    .eq("project_id", projectId)
    .in("status", ["completed", "running"])
    .order("started_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Could not load runs: ${error.message}`);

  const suites = [...new Set((runs ?? []).map((r) => r.suite))];
  const activeSuite = suite && suites.includes(suite) ? suite : suites[0];
  const latest = new Map<string, Run>();
  for (const run of runs ?? []) {
    if (run.suite !== activeSuite) continue;
    if (!latest.has(run.policy_label)) latest.set(run.policy_label, run);
  }
  const chosen = [...latest.values()]
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
    .slice(-maxColumns);

  const columns: MatrixColumn[] = [];
  const rows = new Map<string, MatrixRow & { position: number }>();
  if (chosen.length) {
    const { data: conditions, error: condError } = await supabase
      .from("run_conditions")
      .select("*")
      .in(
        "run_id",
        chosen.map((r) => r.id),
      )
      .order("position", { ascending: true });
    if (condError) throw new Error(`Could not load conditions: ${condError.message}`);
    for (const run of chosen) {
      const own = (conditions ?? []).filter((c) => c.run_id === run.id);
      columns.push({ run, conditions: new Map(own.map((c) => [c.key, c])) });
      for (const c of own) {
        if (!rows.has(c.key)) {
          rows.set(c.key, {
            key: c.key,
            label: c.label,
            scenario: c.scenario,
            description: c.description,
            tags: c.tags,
            sweepName: c.sweep_name,
            sweepValue: c.sweep_value,
            perturbations: c.perturbation_summary,
            position: c.position,
          });
        }
      }
    }
  }
  return {
    suites,
    suite: activeSuite ?? null,
    columns,
    rows: [...rows.values()],
  };
}

export async function listApiKeys(projectId: string): Promise<ApiKey[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, prefix, created_at, last_used_at, revoked_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load API keys: ${error.message}`);
  return data ?? [];
}

export async function listRealTrials(projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("real_trials")
    .select("*")
    .eq("project_id", projectId)
    .order("recorded_at", { ascending: true })
    .limit(10000);
  if (error) throw new Error(`Could not load real-robot trials: ${error.message}`);
  return data ?? [];
}

export async function listMembers(orgId: string) {
  const supabase = await createClient();
  const { data: members, error } = await supabase
    .from("org_members")
    .select("user_id, role, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load members: ${error.message}`);
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, email, display_name").in("id", ids)
    : { data: [] };
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return (members ?? []).map((m) => ({
    ...m,
    email: byId.get(m.user_id)?.email ?? "",
    display_name: byId.get(m.user_id)?.display_name ?? "",
  }));
}

export async function listInvites(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_invites")
    .select("id, email, role, created_at, accepted_at")
    .eq("org_id", orgId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });
  return data ?? [];
}
