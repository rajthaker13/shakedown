import { CodeBlock } from "@/components/docs/code-block";
import { DocPage } from "@/components/docs/doc-page";
import { pageMetadata } from "@/components/docs/nav";
import { A, C, Callout, H2, LI, P, Step, Steps, Strong, UL } from "@/components/docs/prose";
import type { TocItem } from "@/components/docs/toc";
import { DocTable } from "@/components/docs/table";
import { LinkButton } from "@/components/ui/button";

const href = "/docs";

export const metadata = pageMetadata(href);

const toc: TocItem[] = [
  { id: "what-it-is", title: "What it is" },
  { id: "five-stages", title: "The five stages" },
  { id: "who-it-is-for", title: "Who it is for" },
  { id: "how-it-works", title: "How a test run works" },
  { id: "what-it-is-not", title: "What it is not" },
  { id: "untested", title: "What is untested" },
  { id: "next-steps", title: "Next steps" },
];

const example = `shakedown run scenarios/aloha-transfer-cube \\
  --policy lerobot:lerobot/act_aloha_sim_transfer_cube_human \\
  --label v2 \\
  --baseline runs/20260301-101500-v1`;

export default function IntroductionPage() {
  return (
    <DocPage
      href={href}
      toc={toc}
      lead="Shakedown is regression testing for learned robot policies. It tests a checkpoint together with its runtime settings in simulation. Around the tests it keeps the record of which release is approved for which robots, and turns what robots report from the field into proposed tests."
    >
      <H2 id="what-it-is">What it is</H2>
      <P>
        A learned policy can lose success rate between two checkpoints without any error being
        raised. The loss often appears only under a condition that differs from the training
        data: dimmer light, a camera that was knocked, an object a few centimeters off, a slower
        network link. Shakedown tests for those conditions on every checkpoint.
      </P>
      <P>
        You describe each condition in a scenario file. The <C>shakedown</C> command line tool
        runs seeded episodes for every scenario, applies the perturbations, and decides a verdict
        for each condition from the episode outcomes. The verdict is backed by a confidence
        interval or a statistical test, so a drop that could be sampling noise is reported as a
        warning and not as a failure.
      </P>
      <CodeBlock lang="shell" code={example} />
      <P>For each failed episode Shakedown keeps:</P>
      <UL>
        <LI>a replay video showing what the policy saw next to an external view of the scene,</LI>
        <LI>the per-step signals recorded by the environment, such as reward and distances,</LI>
        <LI>
          the first step at which the policy’s actions depart from the unperturbed episode on
          the same seed.
        </LI>
      </UL>

      <H2 id="five-stages">The five stages</H2>
      <P>
        What gets deployed to a robot is a checkpoint <Strong>together with</Strong> its
        runtime settings: how many actions are executed per plan, whether delay is
        compensated, whether plans are ensembled. The same weights behave differently under
        different settings, so Shakedown tests, releases and tracks the two as one thing.
      </P>
      <DocTable
        caption="The five stages of the pipeline"
        head={["Stage", "What happens", "Described in"]}
        monoFirst={false}
        rows={[
          [
            "1. Test before deploying",
            "Run the policy through a suite of conditions in simulation, on your machine or in the cloud, and compare it with the previous version on the same seeds.",
            <>
              <A href="/docs/quickstart">Quickstart</A>,{" "}
              <A href="/docs/cloud-runs">Cloud runs</A>
            </>,
          ],
          [
            "2. Choose runtime settings",
            "Run the same suite under several settings and choose one, keeping the published default unless another is clearly better.",
            <A key="l" href="/docs/runtime-settings">Runtime settings</A>,
          ],
          [
            "3. Release through gates",
            "Move a release from candidate to canary to fleet. Each promotion checks the evidence, and an override is recorded with its reason.",
            <A key="l" href="/docs/releases">Releases and gates</A>,
          ],
          [
            "4. Watch the field",
            "Robots report each attempt: the outcome, whether a person stepped in, and the conditions they measured.",
            <A key="l" href="/docs/field">Field reporting</A>,
          ],
          [
            "5. Turn field conditions into tests",
            "When robots measure a condition that the suite does not cover, a scenario for it is proposed.",
            <A key="l" href="/docs/field#suggestions">Field reporting</A>,
          ],
        ]}
      />
      <P>
        The stages are independent. The CLI tests a checkpoint without a server, and most
        teams will start with stage 1 alone.
      </P>

      <H2 id="who-it-is-for">Who it is for</H2>
      <P>
        Shakedown is for robotics and machine learning engineers who train manipulation policies
        and need to decide whether a new checkpoint is safe to promote. It assumes you have a
        checkpoint that runs in one of the supported simulated environments, or a policy you can
        serve over HTTP.
      </P>
      <UL>
        <LI>
          <Strong>Teams training with LeRobot.</Strong> Checkpoints load directly from a local
          path or the Hugging Face Hub.
        </LI>
        <LI>
          <Strong>Teams with their own inference stack.</Strong> A policy can be tested through
          a three-route HTTP protocol without handing over its weights.
        </LI>
        <LI>
          <Strong>Teams that gate merges on tests.</Strong> The CLI returns exit codes and
          writes JUnit XML and a Markdown summary for CI.
        </LI>
      </UL>

      <H2 id="how-it-works">How a test run works</H2>
      <Steps>
        <Step n={1} title="Write scenarios">
          A scenario is a YAML file that names an environment, the perturbations to apply, how
          many seeded episodes to run, and the assertions that decide the verdict. A sweep turns
          one file into several conditions. See <A href="/docs/scenarios">Scenarios</A>.
        </Step>
        <Step n={2} title="Run the suite against a checkpoint">
          <C>shakedown run</C> loads the policy, runs every condition in simulation and records
          each episode. Episode <C>i</C> of a condition always uses seed <C>seed + i</C>, so two
          checkpoints face the same initial states.
        </Step>
        <Step n={3} title="Read the verdicts">
          Each condition is PASS, WARN or FAIL. The success rate is reported with a Wilson
          interval. With a baseline run on the same seeds, the change is tested with an exact
          McNemar test. See <A href="/docs/statistics">Statistics and verdicts</A>.
        </Step>
        <Step n={4} title="Inspect failures and gate the merge">
          Results are written to a run directory and can be uploaded to the dashboard. In CI the
          exit code fails the job when a condition fails. See{" "}
          <A href="/docs/ci">Running in CI</A>.
        </Step>
      </Steps>

      <H2 id="what-it-is-not">What it is not</H2>
      <UL>
        <LI>
          <Strong>It does not train policies.</Strong> Shakedown only runs inference on
          checkpoints you already have.
        </LI>
        <LI>
          <Strong>It does not control real robots.</Strong> Every episode runs in a
          simulator. On a real robot, Shakedown only receives what your code reports.
        </LI>
        <LI>
          <Strong>It does not deploy.</Strong> It does not push weights or code to robots. It
          answers which release a robot should run, and your own tooling acts on the answer.
        </LI>
        <LI>
          <Strong>It does not replace real-robot testing.</Strong> A pass in simulation is
          evidence, not proof. Simulated results need to be checked against the real system
          before you rely on them.
        </LI>
      </UL>
      <Callout title="Read the limitations">
        <p>
          What a result does and does not tell you is described in{" "}
          <A href="/docs/limitations">Limitations</A> and{" "}
          <A href="/docs/sim-to-real">Sim-to-real validation</A>.
        </p>
      </Callout>

      <H2 id="untested">What is untested</H2>
      <P>Stated once here, and again on each page it concerns:</P>
      <UL>
        <LI>
          Stages 3 to 5 have been tested with synthetic reports and a simulated stand-in for
          a robot. <Strong>No part of Shakedown has yet been used with a physical
          robot.</Strong>
        </LI>
        <LI>
          Only ACT and Diffusion Policy checkpoints have been run. Other LeRobot policy types
          are unverified.
        </LI>
        <LI>
          Results under simulated action delay describe a deployment that does not
          compensate for its delay, unless the compensation option is set.
        </LI>
        <LI>
          The proposals of stage 5 come from fixed rules over reported measurements. Nothing
          is learned.
        </LI>
      </UL>

      <H2 id="next-steps">Next steps</H2>
      <P>
        The quickstart installs the engine, writes a starter suite and runs it against a public
        LeRobot checkpoint. For a public model trained on a hosted task, a{" "}
        <A href="/docs/cloud-runs">cloud run</A> gives a first result without installing
        anything.
      </P>
      <div className="mt-6">
        <LinkButton href="/docs/quickstart" variant="primary" size="lg">
          Go to the quickstart
        </LinkButton>
      </div>
    </DocPage>
  );
}
