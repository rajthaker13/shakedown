import type { Metadata } from "next";

import { ActionForm } from "@/components/action-form";
import { CodeBlock } from "@/components/code/code-block";
import { PageHeader } from "@/components/shell/shell";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { getProjectContext } from "@/lib/data";
import { pct, relativeTime } from "@/lib/format";
import {
  listFieldEpisodes,
  listReleases,
  listSuggestions,
  tally,
  type FieldEpisode,
} from "@/lib/pipeline/data";
import { fisherLower } from "@/lib/pipeline/gates";
import { quantile, type Measured } from "@/lib/pipeline/suggest";
import { wilson } from "@/lib/stats";

import { resolveSuggestion } from "../../../actions";

export const metadata: Metadata = { title: "Field" };

type Group = { name: string; episodes: FieldEpisode[] };

function groupBy(episodes: FieldEpisode[], key: (e: FieldEpisode) => string): Group[] {
  const map = new Map<string, FieldEpisode[]>();
  for (const e of episodes) {
    const name = key(e) || "unnamed";
    map.set(name, [...(map.get(name) ?? []), e]);
  }
  return [...map.entries()]
    .map(([name, list]) => ({ name, episodes: list }))
    .sort((a, b) => b.episodes.length - a.episodes.length);
}

/** A group is flagged when it succeeds less often than everything else, beyond chance. */
function flagged(group: Group, all: FieldEpisode[]): number | null {
  const rest = all.filter((e) => !group.episodes.includes(e));
  if (group.episodes.length < 10 || rest.length < 10) return null;
  const mine = tally(group.episodes);
  const others = tally(rest);
  if (mine.successes / mine.episodes >= others.successes / others.episodes) return null;
  const p = fisherLower(mine.successes, mine.episodes, others.successes, others.episodes);
  return p < 0.05 ? p : null;
}

function RateTable({ title, note, groups, all }: { title: string; note: string; groups: Group[]; all: FieldEpisode[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title={title} description={note} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className="label-caps h-8 pl-4 pr-3 font-medium">Name</th>
              <th scope="col" className="label-caps px-3 text-right font-medium">Episodes</th>
              <th scope="col" className="label-caps px-3 text-right font-medium">Success</th>
              <th scope="col" className="label-caps px-3 text-right font-medium">95% interval</th>
              <th scope="col" className="label-caps px-3 pr-4 text-right font-medium">Interventions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const t = tally(group.episodes);
              const [low, high] = wilson(t.successes, t.episodes);
              const p = flagged(group, all);
              return (
                <tr key={group.name} className="border-b border-line-subtle last:border-0">
                  <td className="h-9 pl-4 pr-3 font-mono text-xs text-fg">
                    {group.name}
                    {p != null ? (
                      <span
                        title={`Lower than the rest, p = ${p.toFixed(3)}`}
                        className="ml-2 rounded-xs border border-fail-line bg-fail-subtle px-1 font-sans text-[11px] text-fail"
                      >
                        below the rest
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 text-right font-mono tabular text-fg-secondary">{t.episodes}</td>
                  <td className="px-3 text-right font-mono tabular text-fg">{pct(t.successes / t.episodes)}</td>
                  <td className="px-3 text-right font-mono tabular text-fg-secondary">
                    {pct(low)}–{pct(high)}
                  </td>
                  <td
                    className={cn(
                      "px-3 pr-4 text-right font-mono tabular",
                      t.interventions ? "text-warn" : "text-fg-tertiary",
                    )}
                  >
                    {t.interventions} · {pct(t.interventions / t.episodes)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default async function FieldPage({ params }: PageProps<"/app/[org]/[project]/field">) {
  const { org, project } = await params;
  const ctx = await getProjectContext(org, project);
  const path = `/app/${ctx.org.slug}/${ctx.project.slug}/field`;
  const [episodes, releases, suggestions] = await Promise.all([
    listFieldEpisodes(ctx.project.id),
    listReleases(ctx.project.id),
    listSuggestions(ctx.project.id),
  ]);

  const snippet = [
    "from shakedown.field import FieldClient",
    "",
    "client = FieldClient()",
    'release = client.release("fleet")',
    "",
    "with client.episode(release=release, robot=\"arm-03\", site=\"line-2\") as episode:",
    "    while not done:",
    "        with episode.inference():        # times each call to the policy",
    "            action = policy(observation)",
    "        observation, done = robot.step(action)",
    "        episode.frame(observation.image)  # records brightness",
    "    episode.finish(success=task_succeeded, intervention=human_stepped_in)",
  ].join("\n");

  if (!episodes.length) {
    return (
      <>
        <PageHeader
          title="Field"
          description="What happens on real robots: how often each release succeeds, how often a person steps in, and the conditions the robots measure."
        />
        <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-10 lg:px-6">
          <div>
            <h2 className="text-base font-semibold">No robot has reported yet</h2>
            <p className="mt-1 text-[13px] text-fg-secondary">
              Wrap the loop that runs your policy. Each attempt is reported with its outcome and
              the delay and image brightness the robot measured. When the field turns out to be
              harsher than your test suite assumes, a test is proposed here.
            </p>
          </div>
          <CodeBlock code={snippet} lang="python" />
        </div>
      </>
    );
  }

  const open = suggestions.filter((s) => s.status === "open");
  const simulated = episodes.filter((e) => e.simulated).length;
  const overall = tally(episodes);
  const byRelease = groupBy(episodes, (e) => {
    const r = releases.find((x) => x.id === e.release_id);
    return r ? `#${r.number} ${r.policy_label}` : `${e.policy_label} (no release)`;
  });
  const measured = (pick: (m: Measured) => number | undefined) =>
    episodes
      .map((e) => pick((e.measured ?? {}) as Measured))
      .filter((v): v is number => typeof v === "number");
  const delay = measured((m) => m.action_delay_ms ?? m.inference_ms);
  const brightness = measured((m) => m.image_brightness);

  return (
    <>
      <PageHeader
        title="Field"
        description={`${episodes.length.toLocaleString("en")} attempts reported, the latest ${relativeTime(episodes[0].started_at)}.`}
      />
      <div className="flex flex-col gap-6 px-4 py-5 lg:px-6">
        {simulated ? (
          <p role="note" className="rounded-sm border border-info-line bg-info-subtle px-3 py-2 text-[13px] text-info">
            {simulated === episodes.length ? "All" : simulated.toLocaleString("en")} of these
            reports come from a simulated stand-in for a robot, not from hardware.
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Success", pct(overall.successes / overall.episodes), `${overall.successes} of ${overall.episodes}`],
            ["Interventions", pct(overall.interventions / overall.episodes), `${overall.interventions} times a person stepped in`],
            ["Action delay", delay.length ? `${Math.round(quantile(delay, 0.5))} ms` : "–", delay.length ? `90th percentile ${Math.round(quantile(delay, 0.9))} ms` : "not reported"],
            ["Image brightness", brightness.length ? String(Math.round(quantile(brightness, 0.5))) : "–", brightness.length ? "median, on a 0 to 255 scale" : "not reported"],
          ].map(([label, value, note]) => (
            <Card key={label} className="flex flex-col gap-1 px-4 py-3">
              <span className="label-caps">{label}</span>
              <span className="font-mono text-[28px] font-semibold leading-8 tracking-[-0.02em] tabular">{value}</span>
              <span className="text-xs text-fg-tertiary">{note}</span>
            </Card>
          ))}
        </div>

        {open.length ? (
          <section aria-labelledby="proposed">
            <h2 id="proposed" className="mb-2 text-sm font-semibold">
              Tests proposed from the field ({open.length})
            </h2>
            <ul className="flex flex-col gap-4">
              {open.map((s) => (
                <li key={s.id}>
                  <Card className="overflow-hidden">
                    <div className="grid gap-4 px-4 py-4 lg:grid-cols-2">
                      <div>
                        <h3 className="text-sm font-semibold">{s.title}</h3>
                        <p className="mt-1 text-[13px] text-fg-secondary">{s.rationale}</p>
                        <p className="mt-3 text-xs text-fg-tertiary">
                          Add the file to your suite and run it. If the policy fails it, you have
                          reproduced a field condition in a test.
                        </p>
                        {ctx.canWrite ? (
                          <div className="mt-3 flex gap-2">
                            <ActionForm
                              action={resolveSuggestion}
                              submit="I have added it"
                              variant="secondary"
                              footer={false}
                              hidden={{ suggestion_id: s.id, status: "accepted", path }}
                            />
                            <ActionForm
                              action={resolveSuggestion}
                              submit="Dismiss"
                              variant="ghost"
                              footer={false}
                              hidden={{ suggestion_id: s.id, status: "dismissed", path }}
                            />
                          </div>
                        ) : null}
                      </div>
                      <CodeBlock code={s.yaml} lang="yaml" filename={`scenarios/${/name: (\S+)/.exec(s.yaml)?.[1] ?? "field"}.yaml`} />
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <RateTable
          title="By release"
          note="Each release against the attempts made while robots were running it."
          groups={byRelease}
          all={episodes}
        />
        <div className="grid gap-6 xl:grid-cols-2">
          <RateTable
            title="By robot"
            note="A robot is flagged when it succeeds less often than the others by more than chance explains."
            groups={groupBy(episodes, (e) => e.robot)}
            all={episodes}
          />
          <RateTable title="By site" note="The same, by location." groups={groupBy(episodes, (e) => e.site)} all={episodes} />
        </div>
      </div>
    </>
  );
}
