import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/code/code-block";
import { GateList } from "@/components/pipeline/gate-list";
import { MoveRelease } from "@/components/pipeline/move-release";
import { PageHeader } from "@/components/shell/shell";
import { Card, EmptyState } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { getProjectContext, listRuns } from "@/lib/data";
import { pct, relativeTime } from "@/lib/format";
import {
  gateFor,
  listFieldEpisodes,
  listReleaseEvents,
  fromHardware,
  listReleases,
  tally,
  type Stage,
} from "@/lib/pipeline/data";
import { passes } from "@/lib/pipeline/gates";

export const metadata: Metadata = { title: "Releases" };

const STAGE: Record<Stage, { label: string; tone: string; help: string }> = {
  candidate: { label: "Candidate", tone: "border-line text-fg-secondary", help: "Tested, not on any robot" },
  canary: { label: "Canary", tone: "border-warn-line bg-warn-subtle text-warn", help: "On a few robots, on trial" },
  fleet: { label: "Fleet", tone: "border-pass-line bg-pass-subtle text-pass", help: "Approved for every robot" },
  retired: { label: "Retired", tone: "border-line text-fg-tertiary", help: "Replaced by a later release" },
  rolled_back: { label: "Rolled back", tone: "border-fail-line bg-fail-subtle text-fail", help: "Withdrawn" },
};

function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span
      title={STAGE[stage].help}
      className={cn(
        "inline-flex h-[22px] items-center rounded-xs border px-1.5 text-[11px] font-medium uppercase tracking-[0.04em]",
        STAGE[stage].tone,
      )}
    >
      {STAGE[stage].label}
    </span>
  );
}

export default async function ReleasesPage({ params }: PageProps<"/app/[org]/[project]/releases">) {
  const { org, project } = await params;
  const ctx = await getProjectContext(org, project);
  const base = `/app/${ctx.org.slug}/${ctx.project.slug}`;
  const path = `${base}/releases`;
  const [releases, events, field, runs] = await Promise.all([
    listReleases(ctx.project.id),
    listReleaseEvents(ctx.project.id),
    listFieldEpisodes(ctx.project.id),
    listRuns(ctx.project.id, {}, 200),
  ]);
  const runNumber = new Map(runs.map((r) => [r.id, r.number]));
  const gates = new Map(
    await Promise.all(
      releases
        .filter((r) => r.stage === "candidate" || r.stage === "canary")
        .map(async (r) => [r.id, await gateFor(ctx.project, r, releases, field)] as const),
    ),
  );
  const live = releases.filter((r) => r.stage === "fleet" || r.stage === "canary");
  const robotSnippet = [
    "from shakedown.field import FieldClient",
    "",
    'client = FieldClient()            # reads SHAKEDOWN_URL and SHAKEDOWN_API_KEY',
    'release = client.release("fleet")  # or "canary" on the robots chosen for trials',
    "print(release.policy_spec, release.runtime_config)",
  ].join("\n");

  return (
    <>
      <PageHeader
        title="Releases"
        description="A release pins a checkpoint together with its runtime settings and the test run that justified it. It moves from candidate to canary to fleet, and each move has a gate."
      />
      <div className="flex flex-col gap-6 px-4 py-5 lg:px-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {(["fleet", "canary"] as const).map((stage) => {
            const current = live.find((r) => r.stage === stage);
            const evidence = current
              ? tally(fromHardware(field).filter((e) => e.release_id === current.id))
              : null;
            return (
              <Card key={stage} className="px-4 py-3">
                <p className="label-caps">{STAGE[stage].label}</p>
                {current ? (
                  <>
                    <p className="mt-1 font-mono text-lg font-semibold">
                      #{current.number} {current.policy_label}
                    </p>
                    <p className="text-xs text-fg-tertiary">
                      since {relativeTime(current.stage_changed_at)}
                      {evidence?.episodes
                        ? ` · ${pct(evidence.successes / evidence.episodes)} over ${evidence.episodes} field episodes`
                        : " · no field reports yet"}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-[13px] text-fg-secondary">
                    Nothing is {stage === "fleet" ? "approved for the fleet" : "on trial"}.
                  </p>
                )}
              </Card>
            );
          })}
        </div>

        {releases.length === 0 ? (
          <EmptyState title="No releases yet">
            Open a finished run and choose “Create release” to propose its policy and settings
            for deployment.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-4">
            {releases.map((release) => {
              const gate = gates.get(release.id) ?? null;
              const met = gate ? passes(gate.checks) : true;
              const history = events.filter((e) => e.release_id === release.id);
              const config = Object.entries((release.runtime_config ?? {}) as Record<string, unknown>);
              const run = release.run_id ? runNumber.get(release.run_id) : undefined;
              return (
                <li key={release.id}>
                  <Card className="overflow-hidden">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-subtle px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold tabular">#{release.number}</span>
                          <span className="font-mono text-sm text-fg">{release.policy_label}</span>
                          <StageBadge stage={release.stage} />
                        </div>
                        <p className="mt-1 flex flex-wrap gap-x-3 font-mono text-xs text-fg-secondary">
                          {config.length
                            ? config.map(([k, v]) => (
                                <span key={k}>
                                  {k}={String(v)}
                                </span>
                              ))
                            : "settings as published"}
                        </p>
                        {release.notes ? (
                          <p className="mt-1 text-[13px] text-fg-secondary">{release.notes}</p>
                        ) : null}
                      </div>
                      {run ? (
                        <Link
                          href={`${base}/runs/${run}`}
                          className="text-[13px] text-accent underline-offset-4 hover:underline"
                        >
                          Test run #{run}
                        </Link>
                      ) : (
                        <span className="text-xs text-fg-tertiary">no test run</span>
                      )}
                    </div>

                    {gate ? (
                      <div className="grid gap-5 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                        <div>
                          <h3 className="label-caps mb-2">Gate to {STAGE[gate.to].label.toLowerCase()}</h3>
                          <GateList checks={gate.checks} />
                        </div>
                        {ctx.canWrite ? (
                          <div className="flex flex-col gap-4">
                            <MoveRelease
                              releaseId={release.id}
                              path={path}
                              to={gate.to as "canary" | "fleet"}
                              label={`Promote to ${STAGE[gate.to].label.toLowerCase()}`}
                              gateMet={met}
                            />
                            <MoveRelease
                              releaseId={release.id}
                              path={path}
                              to={release.stage === "candidate" ? "retired" : "rolled_back"}
                              label={release.stage === "candidate" ? "Retire" : "Roll back"}
                              gateMet
                              variant="secondary"
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : release.stage === "fleet" && ctx.canWrite ? (
                      <div className="px-4 py-4">
                        <MoveRelease
                          releaseId={release.id}
                          path={path}
                          to="rolled_back"
                          label="Roll back"
                          gateMet
                          variant="secondary"
                        />
                        <p className="mt-2 text-xs text-fg-tertiary">
                          Rolling back restores the release this one replaced.
                        </p>
                      </div>
                    ) : null}

                    {history.length ? (
                      <details className="border-t border-line-subtle">
                        <summary className="flex h-9 cursor-pointer list-none items-center px-4 text-xs text-fg-secondary hover:text-fg [&::-webkit-details-marker]:hidden">
                          History ({history.length})
                        </summary>
                        <ol className="flex flex-col gap-2 px-4 pb-3">
                          {history.map((event) => (
                            <li key={event.id} className="text-xs text-fg-secondary">
                              <span className="text-fg-tertiary">{relativeTime(event.created_at)}</span>{" "}
                              {event.from_stage ? `${STAGE[event.from_stage].label} to ` : ""}
                              <span className="text-fg">{STAGE[event.to_stage].label}</span>
                              {event.overridden ? (
                                <span className="ml-1.5 rounded-xs border border-fail-line px-1 text-fail">
                                  gate overridden
                                </span>
                              ) : null}
                              {event.reason ? <span className="block">{event.reason}</span> : null}
                            </li>
                          ))}
                        </ol>
                      </details>
                    ) : null}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}

        <div className="max-w-2xl">
          <h2 className="label-caps mb-2">On the robot</h2>
          <CodeBlock code={robotSnippet} lang="python" />
          <p className="mt-2 text-xs text-fg-tertiary">
            The robot asks which release to run. Shakedown does not push code or weights to
            robots: your own deployment does that, using this answer.
          </p>
        </div>
      </div>
    </>
  );
}
