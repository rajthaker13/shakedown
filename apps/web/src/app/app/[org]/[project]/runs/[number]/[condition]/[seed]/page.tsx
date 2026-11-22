import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Explain } from "@/components/replay/explain";
import { Replay } from "@/components/replay/replay";
import { PageHeader } from "@/components/shell/shell";
import { LinkButton } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status";
import { downloadTrace } from "@/lib/artifacts";
import { getConditions, getEpisode, getEpisodes, getProjectContext, getRun } from "@/lib/data";
import { explainAvailable } from "@/lib/explain";

type Props = PageProps<"/app/[org]/[project]/runs/[number]/[condition]/[seed]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { condition, seed } = await params;
  return { title: `Seed ${seed} · ${decodeURIComponent(condition)}` };
}

export default async function ReplayPage({ params }: Props) {
  const { org, project, number, condition: rawKey, seed: rawSeed } = await params;
  const key = decodeURIComponent(rawKey);
  const seed = Number(rawSeed);
  if (!Number.isInteger(seed)) notFound();

  const ctx = await getProjectContext(org, project);
  const base = `/app/${ctx.org.slug}/${ctx.project.slug}`;
  const run = await getRun(ctx.project.id, Number(number));
  const found = await getEpisode(run.id, key, seed);
  if (!found) notFound();
  const { condition, episode } = found;

  // The same seed with no perturbation, from this run, as the reference.
  const conditions = await getConditions(run.id);
  const nominalCondition = conditions.find(
    (c) => c.env === condition.env && c.perturbation_summary.length === 0 && c.id !== condition.id,
  );
  const [trace, siblings, nominalEpisode] = await Promise.all([
    episode.trace_path ? downloadTrace(episode.trace_path) : Promise.resolve(null),
    getEpisodes(condition.id),
    nominalCondition ? getEpisode(run.id, nominalCondition.key, seed) : Promise.resolve(null),
  ]);
  const nominalTrace = nominalEpisode?.episode.trace_path
    ? await downloadTrace(nominalEpisode.episode.trace_path)
    : null;

  const self = `${base}/runs/${run.number}/${encodeURIComponent(condition.key)}`;
  const index = siblings.findIndex((e) => e.seed === seed);
  const previous = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;
  const status = episode.error ? "ERROR" : episode.success ? "PASS" : "FAIL";

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Runs", href: `${base}/runs` },
          { label: `#${run.number}`, href: `${base}/runs/${run.number}` },
          { label: condition.label, href: self },
          { label: `Seed ${seed}` },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="tabular">Seed {seed}</span>
            <StatusBadge status={status} />
          </span>
        }
        description={
          episode.error
            ? episode.error.split("\n")[0]
            : episode.success
              ? `Succeeded in ${episode.steps} steps.`
              : `Failed after ${episode.steps} steps: ${episode.failure_label ?? "task not completed"}.`
        }
        meta={
          <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-fg-secondary">
            <span>{run.policy_label}</span>
            {condition.perturbation_summary.map((p) => (
              <span key={p}>{p}</span>
            ))}
            {nominalEpisode ? (
              <span className="font-sans text-fg-tertiary">
                Without perturbation this seed{" "}
                <Link
                  href={`${base}/runs/${run.number}/${encodeURIComponent(nominalCondition!.key)}/${seed}`}
                  className="text-accent underline-offset-4 hover:underline"
                >
                  {nominalEpisode.episode.success ? "succeeds" : "also fails"}
                </Link>
                .
              </span>
            ) : null}
          </p>
        }
        actions={
          <>
            {previous ? (
              <LinkButton href={`${self}/${previous.seed}`} aria-label="Previous episode">
                Previous
              </LinkButton>
            ) : null}
            {next ? (
              <LinkButton href={`${self}/${next.seed}`} aria-label="Next episode">
                Next
              </LinkButton>
            ) : null}
          </>
        }
      />
      <div className="flex flex-col gap-5 px-4 py-5 lg:px-6">
        {trace ? (
          <Replay
            key={episode.id}
            videoSrc={episode.video_path ? `/api/artifacts?episode=${episode.id}` : null}
            success={episode.success}
            trace={{
              steps: trace.steps,
              fps: trace.fps,
              signals: trace.signals,
              contacts: trace.contacts,
              firstDivergenceStep: trace.first_divergence_step,
            }}
            nominal={nominalTrace?.signals ?? null}
          />
        ) : (
          <p className="rounded-md border border-dashed border-line px-6 py-8 text-[13px] text-fg-secondary">
            The trace for this episode has not been uploaded. If the run is still in progress it
            will appear shortly.
          </p>
        )}
        {!episode.success && !episode.error && trace ? (
          <Explain episodeId={episode.id} available={explainAvailable()} />
        ) : null}
      </div>
    </>
  );
}
