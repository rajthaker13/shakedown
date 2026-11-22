import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/shell/shell";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/form";
import { siteUrl } from "@/lib/brand";
import { getProjectContext, listApiKeys, projectSettings } from "@/lib/data";
import { relativeTime } from "@/lib/format";
import { gateSettings } from "@/lib/pipeline/data";

import { deleteProject, updateProject, updateThresholds } from "../../../actions";
import { ApiKeys } from "./api-keys";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({
  params,
  searchParams,
}: PageProps<"/app/[org]/[project]/settings">) {
  const { org, project: slug } = await params;
  const query = await searchParams;
  const ctx = await getProjectContext(org, slug);
  if (!ctx.canWrite) notFound();
  const { project } = ctx;
  const path = `/app/${ctx.org.slug}/${project.slug}/settings`;
  // Relative times are worked out here, on the server, so that the first
  // render in the browser matches.
  const keys = (await listApiKeys(project.id)).map((k) => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    revoked: Boolean(k.revoked_at),
    created: relativeTime(k.created_at),
    lastUsed: k.revoked_at
      ? `revoked ${relativeTime(k.revoked_at)}`
      : k.last_used_at
        ? relativeTime(k.last_used_at)
        : "never",
  }));
  const settings = projectSettings(project);
  const gates = gateSettings(project);
  const hidden = { project_id: project.id, path };

  return (
    <>
      <PageHeader title="Settings" description={`Project ${project.name}`} />
      <div className="flex max-w-3xl flex-col gap-6 px-4 py-5 lg:px-6">
        {query.created ? (
          <FormMessage kind="success">
            Project created. Create an API key below, then run your first suite.
          </FormMessage>
        ) : null}

        <Card id="api-keys" className="overflow-hidden">
          <CardHeader
            title="API keys"
            description="Used by the CLI and by CI to upload results. Only a hash of each key is stored."
          />
          <ApiKeys projectId={project.id} path={path} keys={keys} siteUrl={siteUrl} />
        </Card>

        <Card>
          <CardHeader title="General" />
          <ActionForm action={updateProject} submit="Save" hidden={hidden}>
            <div className="flex flex-col gap-4 px-4 py-4">
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" defaultValue={project.name} required maxLength={80} />
              </Field>
              <Field label="Description" htmlFor="description" hint="Shown at the top of the matrix.">
                <Textarea id="description" name="description" defaultValue={project.description} maxLength={500} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Repository" htmlFor="repo_url" hint="Optional.">
                  <Input id="repo_url" name="repo_url" type="url" defaultValue={project.repo_url ?? ""} placeholder="https://github.com/acme/policies" />
                </Field>
                <Field label="Default branch" htmlFor="default_branch" hint="Runs on this branch are the usual baseline.">
                  <Input id="default_branch" name="default_branch" defaultValue={project.default_branch} />
                </Field>
              </div>
            </div>
          </ActionForm>
        </Card>

        <Card>
          <CardHeader
            title="Thresholds"
            description="How the dashboard draws differences, and what a release must show to be promoted. The pass and fail rules for a test live in your scenario files."
          />
          <ActionForm action={updateThresholds} submit="Save" hidden={hidden}>
            <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
              <Field
                label="Noise threshold, in points"
                htmlFor="noise_threshold_pts"
                hint="A change smaller than this is drawn as unchanged, however confident the test."
              >
                <Input id="noise_threshold_pts" name="noise_threshold_pts" type="number" min={0} max={50} step={1} defaultValue={settings.noise_threshold_pts} />
              </Field>
              <Field
                label="Minimum episodes"
                htmlFor="min_episodes"
                hint="Cells with fewer episodes are marked as thinly sampled."
              >
                <Input id="min_episodes" name="min_episodes" type="number" min={1} step={1} defaultValue={settings.min_episodes} />
              </Field>
              <Field
                label="Field episodes before the fleet"
                htmlFor="min_field_episodes"
                hint="Attempts on hardware a canary needs before it can be promoted."
              >
                <Input id="min_field_episodes" name="min_field_episodes" type="number" min={1} step={1} defaultValue={gates.min_field_episodes} />
              </Field>
              <Field
                label="Allowed drop in the field, in points"
                htmlFor="max_field_drop_pts"
                hint="How far below the fleet release a canary may fall before the gate refuses it."
              >
                <Input id="max_field_drop_pts" name="max_field_drop_pts" type="number" min={0} max={100} step={1} defaultValue={gates.max_field_drop_pts} />
              </Field>
            </div>
          </ActionForm>
        </Card>

        <Card className="border-fail-line">
          <CardHeader
            title="Delete this project"
            description="Removes every run, episode and replay. This cannot be undone."
          />
          <ActionForm action={deleteProject} submit="Delete project" variant="danger" hidden={hidden}>
            <div className="px-4 py-4">
              <Field label={`Type ${project.slug} to confirm`} htmlFor="confirm">
                <Input id="confirm" name="confirm" autoComplete="off" spellCheck={false} className="max-w-xs font-mono" />
              </Field>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
