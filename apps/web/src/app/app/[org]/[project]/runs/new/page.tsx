import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/action-form";
import { CodeBlock } from "@/components/code/code-block";
import { PageHeader } from "@/components/shell/shell";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import {
  cloudConfigured,
  episodesUsedThisMonth,
  HOSTED_SUITES,
  MAX_HOSTED_EPISODES,
  MONTHLY_EPISODE_ALLOWANCE,
} from "@/lib/cloud";
import { getProjectContext } from "@/lib/data";
import { getUser } from "@/lib/supabase/server";

import { startCloudRun } from "../../../../actions";

export const metadata: Metadata = { title: "New run" };

export default async function NewRunPage({
  params,
}: PageProps<"/app/[org]/[project]/runs/new">) {
  const { org, project } = await params;
  const ctx = await getProjectContext(org, project);
  if (!ctx.canWrite) notFound();
  const user = await getUser();
  const base = `/app/${ctx.org.slug}/${ctx.project.slug}`;
  const used = user ? await episodesUsedThisMonth(user.id) : 0;
  const left = Math.max(0, MONTHLY_EPISODE_ALLOWANCE - used);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Runs", href: `${base}/runs` }, { label: "New" }]}
        title="New run"
        description="Test a policy in the cloud, or run the suite on your own machine and upload the results."
      />
      <div className="grid max-w-5xl gap-6 px-4 py-5 lg:px-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Run in the cloud"
            description="Each condition runs on its own GPU machine, so a full suite takes a few minutes."
          />
          {cloudConfigured() ? (
            <ActionForm
              action={startCloudRun}
              submit="Start run"
              variant="primary"
              hidden={{ project_id: ctx.project.id, base }}
            >
              <div className="flex flex-col gap-4 px-4 py-4">
                <Field
                  label="Hugging Face model"
                  htmlFor="model"
                  hint="A public model, as owner/name. It must have been trained on the task you choose below."
                >
                  <Input
                    id="model"
                    name="model"
                    required
                    spellCheck={false}
                    placeholder="lerobot/act_aloha_sim_transfer_cube_human"
                    className="font-mono"
                  />
                </Field>
                <Field label="Suite" htmlFor="suite">
                  <Select id="suite" name="suite" defaultValue={HOSTED_SUITES[0].id}>
                    {HOSTED_SUITES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {s.conditions} conditions
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Episodes per condition"
                    htmlFor="episodes"
                    hint={`Up to ${MAX_HOSTED_EPISODES}. More episodes give narrower intervals.`}
                  >
                    <Input id="episodes" name="episodes" type="number" min={1} max={MAX_HOSTED_EPISODES} defaultValue={20} />
                  </Field>
                  <Field label="Label" htmlFor="label" hint="Optional. Names the column in the matrix.">
                    <Input id="label" name="label" maxLength={120} spellCheck={false} className="font-mono" />
                  </Field>
                </div>

                <fieldset className="flex flex-col gap-4 rounded-sm border border-line p-3">
                  <legend className="px-1 text-[13px] font-medium">Runtime settings</legend>
                  <p className="text-xs text-fg-tertiary">
                    What is deployed is the checkpoint together with these settings. Leave them
                    empty to test the model as it was published.
                  </p>
                  <Field
                    label="Actions executed per plan"
                    htmlFor="n_action_steps"
                    hint="How many actions the robot carries out before the policy looks again."
                  >
                    <Input id="n_action_steps" name="n_action_steps" type="number" min={1} max={1000} placeholder="as published" className="max-w-40" />
                  </Field>
                  <label className="flex items-start gap-2.5 text-[13px] text-fg">
                    <input
                      type="checkbox"
                      name="latency_compensation"
                      className="mt-0.5 size-3.5 accent-[var(--color-accent)]"
                    />
                    <span>
                      Compensate for action delay
                      <span className="block text-xs text-fg-tertiary">
                        Skips the actions of each new plan that would arrive too late.
                      </span>
                    </span>
                  </label>
                </fieldset>

                <p className="text-xs text-fg-tertiary">
                  {left.toLocaleString("en")} of {MONTHLY_EPISODE_ALLOWANCE.toLocaleString("en")}{" "}
                  cloud episodes left this month.
                </p>
              </div>
            </ActionForm>
          ) : (
            <div className="px-4 py-4">
              <FormMessage kind="info">
                Cloud runs are not configured on this server. Run the suite on your own machine
                as shown alongside.
              </FormMessage>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader
              title="Run on your own machine"
              description="For your own scenes, private checkpoints, or a policy served from your network. Weights never leave it."
            />
            <div className="flex flex-col gap-3 px-4 py-4">
              <CodeBlock
                lang="bash"
                code={[
                  "shakedown run scenarios \\",
                  "  --policy lerobot:checkpoints/latest \\",
                  "  --label v1.4 --upload",
                ].join("\n")}
              />
              <p className="text-xs text-fg-tertiary">
                Needs an API key from this project&apos;s settings.
              </p>
            </div>
          </Card>
          <Card>
            <CardHeader title="What the cloud can test" />
            <ul className="flex flex-col gap-3 px-4 py-4">
              {HOSTED_SUITES.map((s) => (
                <li key={s.id} className="text-[13px]">
                  <span className="font-medium text-fg">{s.name}</span>
                  <span className="block text-fg-secondary">{s.accepts}.</span>
                  <span className="block font-mono text-xs text-fg-tertiary">e.g. {s.example}</span>
                </li>
              ))}
            </ul>
            <p className="border-t border-line-subtle px-4 py-3 text-xs text-fg-tertiary">
              A policy trained on a real robot cannot be tested here yet: the cloud has no copy of
              that robot&apos;s scene.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
