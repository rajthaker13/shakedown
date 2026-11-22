"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { generateKey } from "@/lib/api/auth";
import { slugify } from "@/lib/format";
import { createClient, getUser } from "@/lib/supabase/server";

export type FormState = {
  error?: string;
  message?: string;
  /** A newly created API key. Present once, in the response that created it. */
  secret?: string;
} | null;

const RESERVED = new Set(["new", "settings", "api", "app", "docs", "demo"]);

async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

// -- projects ---------------------------------------------------------------

const projectInput = z.object({
  name: z.string().min(1, "Give the project a name.").max(80),
  description: z.string().max(500),
  repo_url: z.union([z.literal(""), z.url("Enter a full URL, starting with https://")]),
});

export async function createProject(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const orgSlug = text(form, "org");
  const parsed = projectInput.safeParse({
    name: text(form, "name"),
    description: text(form, "description"),
    repo_url: text(form, "repo_url"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const slug = slugify(text(form, "slug") || parsed.data.name);
  if (slug.length < 2) return { error: "The URL name needs at least two letters or digits." };
  if (RESERVED.has(slug)) return { error: `"${slug}" is reserved. Choose another URL name.` };

  const supabase = await createClient();
  const { data: org } = await supabase.from("orgs").select("id").eq("slug", orgSlug).maybeSingle();
  if (!org) return { error: "That organization was not found." };

  const { error } = await supabase.from("projects").insert({
    org_id: org.id,
    name: parsed.data.name,
    slug,
    description: parsed.data.description,
    repo_url: parsed.data.repo_url || null,
    created_by: user.id,
  });
  if (error) {
    if (error.code === "23505") return { error: `A project named "${slug}" already exists here.` };
    return { error: "Could not create the project." };
  }
  revalidatePath(`/app/${orgSlug}`);
  redirect(`/app/${orgSlug}/${slug}/settings?created=1`);
}

export async function updateProject(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const parsed = projectInput
    .extend({ default_branch: z.string().min(1).max(200) })
    .safeParse({
      name: text(form, "name"),
      description: text(form, "description"),
      repo_url: text(form, "repo_url"),
      default_branch: text(form, "default_branch") || "main",
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      repo_url: parsed.data.repo_url || null,
      default_branch: parsed.data.default_branch,
    })
    .eq("id", text(form, "project_id"))
    .select("id");
  if (error || !data?.length) return { error: "Could not save the project." };
  revalidatePath(text(form, "path"));
  return { message: "Saved." };
}

const thresholds = z.object({
  noise_threshold_pts: z.coerce.number().min(0, "Use 0 or more.").max(50, "Use 50 or less."),
  min_episodes: z.coerce.number().int().min(1, "Use at least 1.").max(100000),
  min_field_episodes: z.coerce.number().int().min(1, "Use at least 1.").max(100000),
  max_field_drop_pts: z.coerce.number().min(0, "Use 0 or more.").max(100, "Use 100 or less."),
});

export async function updateThresholds(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const parsed = thresholds.safeParse({
    noise_threshold_pts: text(form, "noise_threshold_pts"),
    min_episodes: text(form, "min_episodes"),
    min_field_episodes: text(form, "min_field_episodes"),
    max_field_drop_pts: text(form, "max_field_drop_pts"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({ settings: parsed.data })
    .eq("id", text(form, "project_id"))
    .select("id");
  if (error || !data?.length) return { error: "Could not save the thresholds." };
  revalidatePath(text(form, "path"));
  return { message: "Saved." };
}

export async function deleteProject(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const supabase = await createClient();
  const id = text(form, "project_id");
  const { data: project } = await supabase
    .from("projects")
    .select("slug, orgs (slug)")
    .eq("id", id)
    .maybeSingle();
  if (!project) return { error: "Project not found." };
  if (text(form, "confirm") !== project.slug) {
    return { error: `Type "${project.slug}" to confirm.` };
  }
  const { data: runs } = await supabase.from("runs").select("id").eq("project_id", id);
  const { data, error } = await supabase.from("projects").delete().eq("id", id).select("id");
  if (error || !data?.length) {
    return { error: "Only an owner or admin of the organization can delete a project." };
  }
  // Only after the delete was allowed: remove the project's videos and traces.
  const { removeRunArtifacts } = await import("@/lib/artifacts");
  await Promise.all((runs ?? []).map((run) => removeRunArtifacts(id, run.id)));
  redirect(`/app/${project.orgs.slug}`);
}

// -- API keys ---------------------------------------------------------------

/**
 * Keys are written with the service role, after confirming through the
 * viewer's own session that they belong to the project's organization.
 */
async function canWrite(projectId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("can_write_project", { target_project: projectId });
  return Boolean(data);
}

export async function createApiKey(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const projectId = text(form, "project_id");
  const name = text(form, "name");
  if (!name) return { error: "Name the key after where it will be used, e.g. “GitHub Actions”." };
  if (name.length > 80) return { error: "Use 80 characters or fewer." };
  if (!(await canWrite(projectId))) return { error: "You cannot create keys for this project." };

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { key, prefix, hash } = generateKey();
  const { error } = await createAdminClient()
    .from("api_keys")
    .insert({ project_id: projectId, name, prefix, hash, created_by: user.id });
  if (error) return { error: "Could not create the key." };
  revalidatePath(text(form, "path"));
  return { secret: key, message: name };
}

export async function revokeApiKey(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const projectId = text(form, "project_id");
  if (!(await canWrite(projectId))) return { error: "You cannot revoke keys for this project." };
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { error } = await createAdminClient()
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", text(form, "key_id"))
    .eq("project_id", projectId)
    .is("revoked_at", null);
  if (error) return { error: "Could not revoke the key." };
  revalidatePath(text(form, "path"));
  return { message: "Revoked." };
}

// -- runs -------------------------------------------------------------------

export async function deleteRun(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("runs")
    .delete()
    .eq("id", text(form, "run_id"))
    .select("id, project_id");
  if (error || !data?.length) return { error: "Could not delete the run." };
  const { removeRunArtifacts } = await import("@/lib/artifacts");
  await removeRunArtifacts(data[0].project_id, data[0].id);
  redirect(text(form, "next"));
}

// -- team -------------------------------------------------------------------

export async function renameOrg(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const name = text(form, "name");
  if (!name || name.length > 80) return { error: "Use between 1 and 80 characters." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orgs")
    .update({ name })
    .eq("id", text(form, "org_id"))
    .select("id");
  if (error || !data?.length) return { error: "Only an owner or admin can rename the organization." };
  revalidatePath(text(form, "path"));
  return { message: "Saved." };
}

export async function inviteMember(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const email = z.email().safeParse(text(form, "email").toLowerCase());
  if (!email.success) return { error: "Enter a valid email address." };
  const role = text(form, "role") === "admin" ? "admin" : "member";
  const supabase = await createClient();
  const { error } = await supabase.from("org_invites").insert({
    org_id: text(form, "org_id"),
    email: email.data,
    role,
    invited_by: user.id,
  });
  if (error) {
    if (error.code === "23505") return { error: "That address has already been invited." };
    return { error: "Only an owner or admin can invite people." };
  }
  revalidatePath(text(form, "path"));
  return {
    message: `${email.data} will join this organization when they create an account with that address.`,
  };
}

export async function cancelInvite(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("org_invites").delete().eq("id", text(form, "invite_id"));
  if (error) return { error: "Could not cancel the invitation." };
  revalidatePath(text(form, "path"));
  return { message: "Invitation canceled." };
}

export async function removeMember(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_members")
    .delete()
    .eq("org_id", text(form, "org_id"))
    .eq("user_id", text(form, "user_id"))
    .select("user_id");
  if (error || !data?.length) return { error: "Could not remove that member." };
  revalidatePath(text(form, "path"));
  return { message: "Removed." };
}

// -- cloud runs -------------------------------------------------------------

export async function startCloudRun(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const cloud = await import("@/lib/cloud");
  const projectId = text(form, "project_id");
  if (!(await canWrite(projectId))) return { error: "You cannot start runs in this project." };
  if (!cloud.cloudConfigured()) return { error: "Cloud runs are not configured on this server." };

  const model = text(form, "model").replace(/^https?:\/\/huggingface\.co\//, "").replace(/\/$/, "");
  if (!cloud.MODEL_ID.test(model)) {
    return { error: "Enter a Hugging Face model as owner/name, for example lerobot/diffusion_pusht." };
  }
  const suite = cloud.HOSTED_SUITES.find((s) => s.id === text(form, "suite"));
  if (!suite) return { error: "Choose a suite." };
  const episodes = Number(text(form, "episodes"));
  if (!Number.isInteger(episodes) || episodes < 1 || episodes > cloud.MAX_HOSTED_EPISODES) {
    return { error: `Episodes per condition must be between 1 and ${cloud.MAX_HOSTED_EPISODES}.` };
  }

  // Runtime settings become part of the policy spec, so they are recorded with the run.
  const options = new URLSearchParams();
  const steps = text(form, "n_action_steps");
  if (steps) {
    const n = Number(steps);
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      return { error: "Actions per plan must be a whole number between 1 and 1000." };
    }
    options.set("n_action_steps", String(n));
  }
  if (form.get("latency_compensation") === "on") options.set("latency_compensation", "auto");
  const policy = `lerobot:${model}${options.size ? `?${options}` : ""}`;
  const label = (text(form, "label") || `${model.split("/")[1]}${steps ? `-n${steps}` : ""}`).slice(0, 120);

  const used = await cloud.episodesUsedThisMonth(user.id);
  const cost = suite.conditions * episodes;
  if (used + cost > cloud.MONTHLY_EPISODE_ALLOWANCE) {
    const left = Math.max(0, cloud.MONTHLY_EPISODE_ALLOWANCE - used);
    return {
      error: `This run needs ${cost.toLocaleString("en")} episodes and ${left.toLocaleString("en")} of this month's ${cloud.MONTHLY_EPISODE_ALLOWANCE.toLocaleString("en")} are left. Lower the episodes per condition.`,
    };
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  // Compare with the latest cloud run of the same suite and size. Runs made on
  // other machines render differently, so they are not paired with.
  const { data: previous } = await admin
    .from("hosted_jobs")
    .select("id")
    .eq("project_id", projectId)
    .eq("suite", suite.id)
    .eq("episodes", episodes)
    .eq("state", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let baseline: unknown = null;
  let baselineLabel: string | null = null;
  if (previous) {
    const [{ data: run }, { data: conditions }] = await Promise.all([
      admin.from("runs").select("id, policy_label").eq("id", previous.id).maybeSingle(),
      admin.from("run_conditions").select("key, fingerprint, outcomes").eq("run_id", previous.id),
    ]);
    if (run && conditions?.length) {
      baselineLabel = run.policy_label;
      baseline = { id: run.id, policy: { label: run.policy_label }, conditions };
    }
  }

  const { data: job, error } = await admin
    .from("hosted_jobs")
    .insert({
      project_id: projectId,
      requested_by: user.id,
      policy,
      suite: suite.id,
      label,
      episodes,
      conditions: suite.conditions,
    })
    .select("id")
    .single();
  if (error || !job) return { error: "Could not create the run." };

  const { data: run, error: runError } = await admin
    .from("runs")
    .insert({
      id: job.id,
      project_id: projectId,
      suite: suite.id,
      policy_label: label,
      policy_spec: policy,
      status: "running",
      baseline_run_id: previous?.id ?? null,
      baseline_label: baselineLabel,
      host: { platform: "Shakedown cloud" },
    })
    .select("number")
    .single();
  if (runError || !run) {
    await admin.from("hosted_jobs").delete().eq("id", job.id);
    return { error: "Could not create the run." };
  }

  try {
    await cloud.startJob({ id: job.id, policy, suite: suite.id, label, episodes, baseline });
  } catch (err) {
    await admin.from("runs").delete().eq("id", job.id);
    await admin.from("hosted_jobs").delete().eq("id", job.id);
    return { error: err instanceof cloud.CloudError ? err.message : "Could not start the run." };
  }
  redirect(`${text(form, "base")}/runs/${run.number}`);
}

// -- releases ---------------------------------------------------------------

const RUNTIME_KEYS = ["n_action_steps", "temporal_ensemble_coeff", "latency_compensation"];

/** Runtime settings are read out of the policy spec the run was made with. */
function runtimeFromSpec(spec: string): Record<string, string | number> {
  const query = spec.includes("?") ? spec.slice(spec.indexOf("?") + 1) : "";
  const out: Record<string, string | number> = {};
  for (const [key, value] of new URLSearchParams(query)) {
    if (RUNTIME_KEYS.includes(key)) out[key] = /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
  }
  return out;
}

export async function createRelease(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: run } = await supabase
    .from("runs")
    .select("id, project_id, policy_label, policy_spec, status")
    .eq("id", text(form, "run_id"))
    .maybeSingle();
  if (!run) return { error: "That run was not found." };
  if (run.status === "running") return { error: "Wait for the run to finish first." };
  if (run.status !== "completed") {
    return { error: `This run ${run.status === "failed" ? "failed" : "was canceled"}, so it cannot back a release.` };
  }
  const { data, error } = await supabase
    .from("releases")
    .insert({
      project_id: run.project_id,
      run_id: run.id,
      policy_label: run.policy_label,
      policy_spec: run.policy_spec,
      runtime_config: runtimeFromSpec(run.policy_spec),
      notes: text(form, "notes").slice(0, 2000),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not create the release." };
  const { createAdminClient } = await import("@/lib/supabase/admin");
  await createAdminClient().from("release_events").insert({
    release_id: data.id,
    project_id: run.project_id,
    from_stage: null,
    to_stage: "candidate",
    actor: user.id,
    reason: "Created from a test run.",
  });
  redirect(text(form, "next"));
}

export async function moveRelease(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const releaseId = text(form, "release_id");
  const to = text(form, "to");
  const reason = text(form, "reason").slice(0, 1000);
  const override = form.get("override") === "on";

  const supabase = await createClient();
  const { data: release } = await supabase
    .from("releases")
    .select("*, projects (*)")
    .eq("id", releaseId)
    .maybeSingle();
  if (!release?.projects) return { error: "That release was not found." };
  if (!(await canWrite(release.project_id))) return { error: "You cannot change releases here." };

  const allowed: Record<string, string[]> = {
    candidate: ["canary", "retired"],
    canary: ["fleet", "rolled_back"],
    fleet: ["rolled_back"],
  };
  if (!allowed[release.stage]?.includes(to)) {
    return { error: `A ${release.stage} release cannot become ${to.replace("_", " ")}.` };
  }

  const pipeline = await import("@/lib/pipeline/data");
  const { passes } = await import("@/lib/pipeline/gates");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  let gate: Awaited<ReturnType<typeof pipeline.gateFor>> = null;
  if (to === "canary" || to === "fleet") {
    const [all, field] = await Promise.all([
      pipeline.listReleases(release.project_id),
      pipeline.listFieldEpisodes(release.project_id),
    ]);
    gate = await pipeline.gateFor(release.projects, release, all, field);
    if (gate && !passes(gate.checks)) {
      if (!override) {
        const failed = gate.checks.filter((c) => !c.ok).map((c) => c.label.toLowerCase());
        return { error: `The gate is not met: ${failed.join("; ")}.` };
      }
      if (reason.length < 10) {
        return { error: "To override the gate, say why in at least a sentence. It is recorded." };
      }
    }
  } else if (reason.length < 3) {
    return { error: "Say why, so the record explains it." };
  }

  const now = new Date().toISOString();
  // One release per stage: whatever held the target stage steps aside.
  if (to === "canary" || to === "fleet") {
    const { data: holders } = await admin
      .from("releases")
      .select("id, stage")
      .eq("project_id", release.project_id)
      .eq("stage", to)
      .neq("id", release.id);
    for (const holder of holders ?? []) {
      await admin.from("releases").update({ stage: "retired", stage_changed_at: now }).eq("id", holder.id);
      await admin.from("release_events").insert({
        release_id: holder.id,
        project_id: release.project_id,
        from_stage: holder.stage,
        to_stage: "retired",
        actor: user.id,
        reason: `Replaced by release #${release.number}.`,
      });
    }
  }
  const { error } = await admin
    .from("releases")
    .update({ stage: to as "canary" | "fleet" | "retired" | "rolled_back", stage_changed_at: now })
    .eq("id", release.id)
    .eq("stage", release.stage);
  if (error) return { error: "Could not move the release." };
  await admin.from("release_events").insert({
    release_id: release.id,
    project_id: release.project_id,
    from_stage: release.stage,
    to_stage: to as "canary" | "fleet" | "retired" | "rolled_back",
    actor: user.id,
    reason,
    gate: (gate?.checks ?? []) as never,
    overridden: Boolean(gate && !passes(gate.checks)),
  });

  // Rolling back the fleet release puts the one it replaced back in charge.
  if (to === "rolled_back" && release.stage === "fleet") {
    const { data: previous } = await admin
      .from("release_events")
      .select("release_id")
      .eq("project_id", release.project_id)
      .eq("from_stage", "fleet")
      .eq("to_stage", "retired")
      .eq("reason", `Replaced by release #${release.number}.`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previous) {
      await admin
        .from("releases")
        .update({ stage: "fleet", stage_changed_at: now })
        .eq("id", previous.release_id);
      await admin.from("release_events").insert({
        release_id: previous.release_id,
        project_id: release.project_id,
        from_stage: "retired",
        to_stage: "fleet",
        actor: user.id,
        reason: `Restored after release #${release.number} was rolled back.`,
      });
    }
  }
  revalidatePath(text(form, "path"));
  return { message: `Release #${release.number} is now ${to.replace("_", " ")}.` };
}

export async function resolveSuggestion(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const status = text(form, "status") === "accepted" ? "accepted" : "dismissed";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scenario_suggestions")
    .update({ status, resolved_at: new Date().toISOString() })
    .eq("id", text(form, "suggestion_id"))
    .select("id");
  if (error || !data?.length) return { error: "Could not update the suggestion." };
  revalidatePath(text(form, "path"));
  return { message: status === "accepted" ? "Marked as added to the suite." : "Dismissed." };
}
