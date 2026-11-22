import {
  ArrowRight,
  Check,
  FlaskConical,
  GitPullRequestArrow,
  KeyRound,
  Radar,
  Sigma,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { CodeBlock } from "@/components/code/code-block";
import { ContactForm } from "@/components/marketing/contact-form";
import { EmbeddedMatrix } from "@/components/marketing/embedded-matrix";
import type { MatrixData } from "@/components/matrix/types";
import { LinkButton } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/cn";
import latency from "@/lib/demo-latency.json";
import fixture from "@/lib/demo-matrix.json";
import { pct, pValue } from "@/lib/format";
import { classify, compare } from "@/lib/stats";

const demo = fixture as unknown as MatrixData & {
  meta: { checkpoint: string; env: string; episodes: number; engine: string };
};

/**
 * Facts quoted on this page are computed from the demo results, never typed
 * in. The story told is the comparison between two settings of one policy.
 */
const BASE = "act-chunk50";
const HEAD = "act-chunk25";

function demoFacts() {
  const base = demo.columns.find((c) => c.label === BASE) ?? demo.columns[0];
  const head = demo.columns.find((c) => c.label === HEAD) ?? demo.columns[demo.columns.length - 1];
  const changes = demo.rows
    .map((row) => {
      const b = demo.cells[row.key]?.[base.id];
      const h = demo.cells[row.key]?.[head.id];
      if (!b || !h) return null;
      const cmp = compare(b.outcomes, h.outcomes, b.fingerprint === h.fingerprint);
      return { row, base: b, head: h, cmp, kind: classify(cmp, demo.noiseThresholdPts / 100) };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const nominal = changes.find((c) => c.row.perturbations.length === 0);
  const regressions = changes
    .filter((c) => c.kind === "regression")
    .sort((a, b) => a.cmp.delta - b.cmp.delta);
  const suspects = changes.filter((c) => c.kind === "suspect");
  return { base, head, nominal, regressions, suspects, conditions: demo.rows.length };
}

const SCENARIO = `version: 1
name: camera-pan
description: The top camera is rotated, as after a knock to its mount.
env: aloha/transfer_cube
episodes: 50
seed: 1000
sweep:
  name: pan
  values: [1, 2, 4]
perturbations:
  - camera_pose: { camera: top, pan_deg: "\${pan}" }
assertions:
  success_rate: { min: 0.6 }
  regression: { max_drop: 0.10 }
`;

const WORKFLOW = `- name: Test the new checkpoint
  run: |
    ${brand.cli} run scenarios \\
      --policy lerobot:checkpoints/latest \\
      --label \${{ github.sha }} \\
      --baseline-branch main \\
      --upload
  env:
    SHAKEDOWN_URL: \${{ vars.SHAKEDOWN_URL }}
    SHAKEDOWN_API_KEY: \${{ secrets.SHAKEDOWN_API_KEY }}
`;

const SERVE = `# On your machine, next to the weights
${brand.cli} serve-policy --policy lerobot:checkpoints/latest --port 8000

# The test runner only ever sees observations and actions
${brand.cli} run scenarios --policy http://localhost:8000 --label v1.4
`;

function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
  className,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  lead?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("border-t border-line-subtle", className)}>
      <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:py-24">
        <p className="eyebrow text-accent">{eyebrow}</p>
        <h2 className="mt-4 max-w-3xl text-[28px] font-semibold leading-[34px] tracking-[-0.025em] md:text-[40px] md:leading-[48px]">
          {title}
        </h2>
        {lead ? (
          <p className="mt-4 max-w-2xl text-lg leading-7 text-fg-secondary">{lead}</p>
        ) : null}
        <div className="mt-10 lg:mt-14">{children}</div>
      </div>
    </section>
  );
}

function Feature({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Check;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-l border-line pl-5">
      <Icon aria-hidden="true" className="size-5 text-fg-secondary" strokeWidth={1.5} />
      <h3 className="text-lg font-semibold tracking-[-0.015em]">{title}</h3>
      <p className="text-[15px] leading-6 text-fg-secondary">{children}</p>
    </div>
  );
}

/** The delay experiment: the setting and delay where compensation matters most. */
function delayHeadline() {
  const row = latency.rows.find((r) => r.n_action_steps === 50) ?? latency.rows[0];
  if (!row) return null;
  const cell = row.cells[row.cells.length - 1];
  return { row, cell, zero: row.cells[0] };
}

export default function Home() {
  const facts = demoFacts();
  const headline = delayHeadline();
  const install = `pip install -e "engine[lerobot]"`;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="bg-grid pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]"
        />
        <div className="relative mx-auto max-w-[1200px] px-4 pb-10 pt-16 text-center sm:px-6 lg:pt-24">
          <p className="eyebrow text-accent">{brand.tagline}</p>
          <h1 className="mx-auto mt-5 max-w-4xl text-[40px] font-semibold leading-[44px] tracking-[-0.035em] md:text-[64px] md:leading-[68px]">
            You deploy a checkpoint and its settings. Test both.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-7 text-fg-secondary md:text-xl md:leading-[30px]">
            What runs on the robot is a checkpoint together with how it is run: how often it
            re-plans, how it handles delay. {brand.name} runs both through seeded scenarios in
            simulation and reports, condition by condition, what changed against your last
            checkpoint, with intervals and a paired comparison.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <LinkButton href="/signup" variant="primary" size="lg">
              Run your first suite
              <ArrowRight aria-hidden="true" className="size-4" />
            </LinkButton>
            <LinkButton href="/demo" variant="secondary" size="lg">
              Open the live demo
            </LinkButton>
          </div>
          <p className="mt-4 text-[13px] text-fg-tertiary">
            The command line tool runs on your own machine. No account is needed to try it.
          </p>
        </div>

        {/* The product itself, on real results. */}
        <div className="relative mx-auto max-w-[1200px] px-4 pb-16 sm:px-6 lg:pb-24">
          <div className="overflow-hidden rounded-lg border border-line bg-base text-left">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-surface px-4 py-2.5">
              <p className="font-mono text-xs text-fg-secondary">{demo.meta.checkpoint}</p>
              <p className="text-xs text-fg-tertiary">
                {demo.meta.episodes.toLocaleString("en")} real episodes · select any cell
              </p>
            </div>
            <Suspense fallback={<div className="h-[620px]" />}>
              <EmbeddedMatrix
                data={demo}
                initial={{ mode: "delta", base: facts.base.label, cell: null, only: false }}
              />
            </Suspense>
          </div>
          <p className="mx-auto mt-4 max-w-3xl text-center text-[13px] text-fg-tertiary">
            These are real results, not a mock-up: one public ACT checkpoint in MuJoCo, run with
            four inference settings, 50 seeded episodes per cell. The view shows each setting
            against <span className="font-mono">{facts.base.label}</span>. Every episode can be
            replayed in the{" "}
            <Link href="/demo" className="text-accent underline-offset-4 hover:underline">
              live demo
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Pipeline */}
      <Section
        eyebrow="Around the tests"
        title="Five stages, each with evidence behind it."
        lead="Testing is the core. Tuning, release gates and field reports build on the same results. They have been exercised in simulation and end-to-end tests, not yet on a real robot."
      >
        <ol className="grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-5">
          {[
            ["Test", "Run the checkpoint through seeded scenarios: dim light, a knocked camera, clutter, delay.", "/docs/scenarios"],
            ["Tune", "Sweep the runtime settings and choose one, or learn that none is clearly better.", "/docs/runtime-settings"],
            ["Release", "Promote from candidate to canary to fleet. Each step has a gate, and overrides are recorded.", "/docs/releases"],
            ["Watch", "Robots report outcomes, interventions, delay and image brightness from the field.", "/docs/field"],
            ["Learn", "When the field is harsher than the suite assumes, a test is proposed for it.", "/docs/field"],
          ].map(([name, text, href], i) => (
            <li key={name} className="flex flex-col gap-2 bg-surface p-5">
              <span className="font-mono text-xs text-fg-tertiary">0{i + 1}</span>
              <h3 className="text-lg font-semibold tracking-[-0.015em]">{name}</h3>
              <p className="flex-1 text-[14px] leading-[22px] text-fg-secondary">{text}</p>
              <Link href={href} className="text-[13px] text-accent underline-offset-4 hover:underline">
                How it works
              </Link>
            </li>
          ))}
        </ol>
        <p className="mt-5 max-w-3xl text-[13px] text-fg-tertiary">
          Testing and tuning run in simulation today. Releases and field reports are built and
          tested end to end with a simulated stand-in for a robot; they have not yet run on
          hardware.
        </p>
      </Section>

      {/* Problem */}
      <Section
        eyebrow="The problem"
        title="A better average can hide a broken condition."
        lead="Most teams judge a new checkpoint by a handful of rollouts on a real robot and one success rate. That number moves for reasons nobody can see."
      >
        <div className="grid gap-10 md:grid-cols-3">
          {headline ? (
            <div className="border-l border-line pl-5">
              <p className="font-mono text-[40px] font-semibold leading-none tracking-[-0.03em] tabular">
                <span className="text-fail">{pct(headline.cell.plain)}</span>{" "}
                <span className="text-fg-tertiary">→</span> {pct(headline.cell.compensated)}
              </p>
              <p className="mt-3 text-[15px] leading-6 text-fg-secondary">
                One public policy, with actions arriving {headline.cell.delay_ms} ms late. The
                only difference is a runtime setting that skips the actions that are already
                stale. With no delay the two score {pct(headline.zero.plain)} and{" "}
                {pct(headline.zero.compensated)}, so the usual test cannot tell them apart.
              </p>
            </div>
          ) : null}
          <div className="border-l border-line pl-5">
            <h3 className="text-lg font-semibold tracking-[-0.015em]">
              Ten rollouts cannot tell 70% from 90%.
            </h3>
            <p className="mt-3 text-[15px] leading-6 text-fg-secondary">
              With ten trials, a policy that truly succeeds 80% of the time scores 6 or fewer,
              or a perfect 10, nearly one time in four. Teams ship and revert checkpoints on
              differences that are sampling noise.
            </p>
          </div>
          <div className="border-l border-line pl-5">
            <h3 className="text-lg font-semibold tracking-[-0.015em]">
              Nobody knows which change caused it.
            </h3>
            <p className="mt-3 text-[15px] leading-6 text-fg-secondary">
              Evaluation lives in notebooks and spreadsheets. When a deployed robot starts
              failing, there is no record of which checkpoint introduced the weakness or under
              which conditions.
            </p>
          </div>
        </div>
      </Section>

      {/* The delay experiment */}
      <Section
        eyebrow="A real result"
        title="The setting that matters most is one the benchmark cannot see."
        lead="The same checkpoint, with and without skipping stale actions, as delay grows. Fifty seeded episodes per cell, run on the cloud runner."
      >
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[720px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-line bg-surface text-left">
                <th scope="col" className="label-caps h-10 px-4 font-medium">Actions per plan</th>
                <th scope="col" className="label-caps px-4 font-medium">Stale actions</th>
                {latency.rows[0]?.cells.map((c) => (
                  <th key={c.delay_ms} scope="col" className="label-caps px-4 text-right font-medium">
                    {c.delay_ms === 0 ? "No delay" : `${c.delay_ms} ms`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {latency.rows.flatMap((row) =>
                (["plain", "compensated"] as const).map((kind) => (
                  <tr key={`${row.n_action_steps}-${kind}`} className="border-b border-line-subtle last:border-0">
                    <td className="h-11 px-4 font-mono tabular text-fg">
                      {kind === "plain" ? row.n_action_steps : ""}
                    </td>
                    <td className="px-4 text-fg-secondary">{kind === "plain" ? "executed" : "skipped"}</td>
                    {row.cells.map((c) => {
                      const clear = c.p < 0.05 && c.compensated > c.plain;
                      return (
                        <td
                          key={c.delay_ms}
                          className={cn(
                            "px-4 text-right font-mono tabular",
                            kind === "plain" && clear ? "text-fail" : "text-fg",
                            kind === "compensated" && clear ? "font-medium" : "",
                          )}
                        >
                          {pct(c[kind])}
                          {kind === "compensated" && clear ? (
                            <span className="ml-2 text-xs font-normal text-fg-tertiary">
                              +{Math.round((c.compensated - c.plain) * 100)}, p {pValue(c.p)}
                            </span>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-5 grid max-w-4xl gap-3 text-[13px] leading-5 text-fg-tertiary md:grid-cols-2">
          <p>
            What this does not show. It is one checkpoint on one simulated task. On a second
            task with the same kind of policy the gain appeared again at 200 ms and was
            unclear elsewhere. With a Diffusion Policy on a third task, delay cut success from
            73% to 23% and skipping stale actions did not clearly help. So the size of the
            effect depends on the policy, which is the reason to measure it.
          </p>
          <p>
            Rows with the same settings and no delay differ by up to six points. Runs on the
            cloud runner are not bit-reproducible across machines, so that is the noise to read
            the rest against. The idea is not new:{" "}
            <a
              href="https://arxiv.org/abs/2506.07339"
              className="text-accent underline-offset-4 hover:underline"
            >
              real-time chunking
            </a>{" "}
            (Black, Galliker and Levine, 2025) starts from the same observation that the first
            actions of a delayed chunk arrive too late to use.
          </p>
        </div>
      </Section>

      {/* How it works */}
      <Section
        id="how-it-works"
        eyebrow="How it works"
        title="Scenario files in your repository. A check on every checkpoint."
      >
        <ol className="grid gap-8 lg:grid-cols-3">
          <li className="flex min-w-0 flex-col gap-4">
            <div>
              <p className="font-mono text-xs text-fg-tertiary">01</p>
              <h3 className="mt-1 text-lg font-semibold tracking-[-0.015em]">
                Describe the conditions
              </h3>
              <p className="mt-2 text-[15px] leading-6 text-fg-secondary">
                One YAML file per condition: what to change, how many seeded episodes to run, and
                what counts as passing. A sweep finds the point where the policy breaks.
              </p>
            </div>
            <CodeBlock code={SCENARIO} lang="yaml" filename="scenarios/camera-pan.yaml" />
          </li>
          <li className="flex min-w-0 flex-col gap-4">
            <div>
              <p className="font-mono text-xs text-fg-tertiary">02</p>
              <h3 className="mt-1 text-lg font-semibold tracking-[-0.015em]">
                Run it on every checkpoint
              </h3>
              <p className="mt-2 text-[15px] leading-6 text-fg-secondary">
                One command, locally or in CI. The same seeds run against the baseline and the
                candidate, so the comparison is episode by episode.
              </p>
            </div>
            <CodeBlock code={WORKFLOW} lang="yaml" filename=".github/workflows/policy.yml" />
          </li>
          <li className="flex min-w-0 flex-col gap-4">
            <div>
              <p className="font-mono text-xs text-fg-tertiary">03</p>
              <h3 className="mt-1 text-lg font-semibold tracking-[-0.015em]">
                Read the verdict, watch the failure
              </h3>
              <p className="mt-2 text-[15px] leading-6 text-fg-secondary">
                The job fails when a condition regressed with statistical support. Each failed
                episode has a replay that opens at the step where behavior departed from the
                baseline.
              </p>
            </div>
            <div className="overflow-hidden rounded-md border border-line bg-inset p-4 font-mono text-[13px] leading-5">
              <p className="text-fg-tertiary">camera-pan · pan=4</p>
              <p className="mt-1 text-fail">
                ✗ down 18% on v1.3 (82% to 64%), p = 0.012, paired on the same seeds
              </p>
              <p className="mt-3 text-fg-tertiary">lighting-dim · level=0.4</p>
              <p className="mt-1 text-warn">
                ! down 8% on v1.3, but not statistically clear (p = 0.29)
              </p>
              <p className="mt-3 text-fg-tertiary">action-latency · steps=2</p>
              <p className="mt-1 text-pass">✓ within 5% of v1.3 (78% to 76%)</p>
              <p className="mt-4 border-t border-line-subtle pt-3 text-xs text-fg-tertiary">
                Example output. The format is the engine&apos;s; the values are illustrative.
              </p>
            </div>
          </li>
        </ol>
      </Section>

      {/* Features */}
      <Section
        eyebrow="What you get"
        title="Built to be believed by the engineer who has to act on it."
      >
        <div className="grid gap-x-10 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
          <Feature icon={Sigma} title="Verdicts that respect sample size">
            Every rate carries a confidence interval. A condition fails only when the evidence is
            clear; when it is not, you get a warning and the number of episodes that would settle
            it.
          </Feature>
          <Feature icon={GitPullRequestArrow} title="Paired comparison between checkpoints">
            Baseline and candidate run on identical seeds, so the test looks only at episodes
            whose outcome changed. That detects regressions that comparing two averages would
            miss.
          </Feature>
          <Feature icon={FlaskConical} title="Replay from the point of divergence">
            Each failure is recorded as the policy saw it, next to an external view, with
            per-step signals. The timeline marks the first step where actions departed from the
            nominal run.
          </Feature>
          <Feature icon={KeyRound} title="Your weights stay with you">
            Serve the policy from your own machine over a three-route HTTP protocol. The test
            runner exchanges observations and actions and never receives the model.
          </Feature>
          <Feature icon={Radar} title="Checked against the real robot">
            Log real trials next to simulated ones and see how well simulation predicts reality
            for your scene, per condition. Until you have measured that, treat results as
            relative between checkpoints.
          </Feature>
          <Feature icon={Check} title="Deterministic and reproducible">
            Seeds fix the scene, the perturbations and the policy&apos;s sampling. Each result
            records the policy, its options and a hash of the weights, so any run can be
            repeated.
          </Feature>
        </div>
      </Section>

      {/* Keep your weights */}
      <Section
        eyebrow="Integration"
        title="Works with what you already train and run."
        lead="LeRobot checkpoints load directly. Anything else connects through the policy protocol."
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <CodeBlock code={SERVE} lang="bash" />
          <dl className="grid content-start gap-x-8 gap-y-5 sm:grid-cols-2">
            {[
              ["Simulators", "MuJoCo, and pymunk for 2D tasks. Other simulators plug in through a documented adapter interface."],
              ["Policies", "LeRobot checkpoints in-process, or any policy behind the HTTP protocol."],
              ["CI", "GitHub Actions job summaries, JUnit XML for other systems, and exit codes that fail the build."],
              ["Runs on", "macOS and Linux, on a laptop or a GPU runner. No Omniverse installation is required."],
            ].map(([term, text]) => (
              <div key={term}>
                <dt className="label-caps">{term}</dt>
                <dd className="mt-1.5 text-[15px] leading-6 text-fg-secondary">{text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      {/* Pricing */}
      <Section
        id="pricing"
        eyebrow="Pricing"
        title="Free while in early access."
        lead="The product is new. We would rather earn a small number of teams who rely on it than charge early."
      >
        <div className="grid gap-5 lg:grid-cols-3">
          {[
            {
              name: "Command line",
              price: "Free",
              note: "Runs on your machine",
              points: [
                "Every environment and perturbation",
                "Unlimited local runs",
                "Terminal, Markdown and JUnit reports",
                "Replay videos and traces on disk",
              ],
              cta: { label: "Read the quickstart", href: "/docs/quickstart", variant: "secondary" as const },
            },
            {
              name: "Dashboard",
              price: "Free",
              note: "During early access",
              points: [
                "Matrix, comparison and replay in the browser",
                "Live results as a run progresses",
                "Shared with your team",
                "Pricing will be announced before any charge",
              ],
              cta: { label: "Create an account", href: "/signup", variant: "primary" as const },
            },
            {
              name: "Design partner",
              price: "Let’s talk",
              note: "For teams deploying to real robots",
              points: [
                "A suite built with you for your scene",
                "Sim-to-real validation on your arm",
                "Runs on your own infrastructure",
                "A direct line to the people building it",
              ],
              cta: { label: "Get in touch", href: "/contact", variant: "secondary" as const },
            },
          ].map((plan) => (
            <div key={plan.name} className="flex flex-col rounded-lg border border-line bg-surface p-6">
              <h3 className="text-sm font-medium text-fg-secondary">{plan.name}</h3>
              <p className="mt-3 text-[32px] font-semibold leading-none tracking-[-0.03em]">
                {plan.price}
              </p>
              <p className="mt-2 text-[13px] text-fg-tertiary">{plan.note}</p>
              <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                {plan.points.map((point) => (
                  <li key={point} className="flex gap-2.5 text-[14px] leading-5 text-fg-secondary">
                    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-tertiary" />
                    {point}
                  </li>
                ))}
              </ul>
              <LinkButton href={plan.cta.href} variant={plan.cta.variant} size="lg" className="mt-8">
                {plan.cta.label}
              </LinkButton>
            </div>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section eyebrow="Questions" title="What engineers ask first.">
        <div className="grid max-w-3xl gap-px overflow-hidden rounded-lg border border-line bg-line">
          {[
            [
              "Does a result in simulation predict what the real robot will do?",
              "Not by itself. Published comparisons range from strong to poor depending on how closely the simulated scene matches the real one. Shakedown is most reliable as a relative measure: the same scene, the same seeds, two checkpoints. To use absolute numbers, record real trials and check the correlation on the sim-to-real page first.",
            ],
            [
              "Where does the simulation run?",
              "Usually where you run the command: your laptop, a workstation, or a CI runner. The dashboard then only receives results, videos and traces. The exception is a cloud run, which the dashboard starts on a separate GPU runner to test a public Hugging Face model on a hosted suite.",
            ],
            [
              "What leaves my infrastructure?",
              "Per-episode outcomes, recorded signals, and replay videos for the episodes the engine records. Policy weights are never uploaded. With a served policy they are never even read by the test runner.",
            ],
            [
              "Which policies and simulators are supported?",
              "LeRobot checkpoints load directly, and any other policy can be tested through the HTTP policy protocol. MuJoCo is the main simulator. The bundled environments are the ALOHA bimanual tasks and PushT; your own scene needs an adapter, which the docs describe.",
            ],
            [
              "How many episodes do I need?",
              "More than most teams run. Fifty per condition gives an interval of roughly plus or minus 12 points around 75%. The docs include a table, and every warning tells you how many episodes would resolve it.",
            ],
            [
              "Is the first divergent step the cause of the failure?",
              "No. It is the first step at which commanded actions departed from the nominal run for several steps in a row. It tells you where to start looking.",
            ],
          ].map(([q, a]) => (
            <details key={q} className="group bg-surface">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 px-5 py-4 text-[15px] font-medium text-fg [&::-webkit-details-marker]:hidden">
                {q}
                <span
                  aria-hidden="true"
                  className="text-xl leading-none text-fg-tertiary transition-transform duration-150 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="px-5 pb-5 text-[15px] leading-6 text-fg-secondary">{a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* Final call to action */}
      <section className="border-t border-line-subtle bg-surface">
        <div className="mx-auto grid max-w-[1200px] gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div>
            <h2 className="text-[28px] font-semibold leading-[34px] tracking-[-0.025em] md:text-[40px] md:leading-[48px]">
              Put your next checkpoint through a shakedown.
            </h2>
            <p className="mt-4 max-w-md text-lg leading-7 text-fg-secondary">
              Install the engine from the repository and run the bundled suite against a public
              checkpoint in a few minutes.
            </p>
            <div className="mt-8 flex max-w-md items-center gap-1 rounded-md border border-line bg-inset pl-4 pr-1">
              <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap py-3 font-mono text-[13px] text-fg">
                {install}
              </code>
              <CopyButton value={install} label="Copy install command" />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <LinkButton href="/docs/quickstart" variant="primary" size="lg">
                Follow the quickstart
              </LinkButton>
              <LinkButton href="/demo" variant="secondary" size="lg">
                Open the live demo
              </LinkButton>
            </div>
          </div>
          <div className="rounded-lg border border-line bg-base p-6">
            <h3 className="text-base font-semibold">Deploying to real robots?</h3>
            <p className="mb-5 mt-1 text-[14px] text-fg-secondary">
              Tell us about your policy and task. We will help you build the first suite.
            </p>
            <ContactForm source="landing" />
          </div>
        </div>
      </section>
    </>
  );
}
