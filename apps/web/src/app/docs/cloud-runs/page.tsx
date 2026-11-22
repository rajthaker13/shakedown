import { CodeBlock } from "@/components/docs/code-block";
import { DocPage } from "@/components/docs/doc-page";
import { pageMetadata } from "@/components/docs/nav";
import { A, C, Callout, H2, H3, LI, P, Step, Steps, Strong, UL } from "@/components/docs/prose";
import { DocTable } from "@/components/docs/table";
import type { TocItem } from "@/components/docs/toc";

const href = "/docs/cloud-runs";

export const metadata = pageMetadata(href);

const toc: TocItem[] = [
  { id: "what", title: "What a cloud run is" },
  { id: "can-test", title: "What can be tested" },
  { id: "cannot-test", title: "What cannot", level: 3 },
  { id: "suites", title: "Hosted suites" },
  { id: "start", title: "Starting a run" },
  { id: "limits", title: "Limits" },
  { id: "baselines", title: "What a cloud run is compared with" },
  { id: "data", title: "What the runner downloads and keeps" },
  { id: "self-hosting", title: "Hosting the runner yourself" },
  { id: "runner-api", title: "The runner’s routes", level: 3 },
  { id: "status", title: "Status" },
];

const deploy = `# From the root of the repository
pip install modal
modal setup

# The token the web app will send. Choose a long random string.
modal secret create shakedown-cloud SHAKEDOWN_CLOUD_TOKEN="<a long random string>"

modal deploy cloud/modal_app.py`;

const env = `SHAKEDOWN_CLOUD_URL="https://<the URL that modal deploy printed for the api function>"
SHAKEDOWN_CLOUD_TOKEN="<the same string>"`;

const health = `curl "$SHAKEDOWN_CLOUD_URL/health"`;

const healthOut = `{"ok":true,"suites":["aloha-transfer-cube","aloha-latency","aloha-insertion-latency"],"max_episodes":50}`;

const volume = `/jobs/<id>/job.json                 what was asked for
/jobs/<id>/state.json               queued | running | completed | failed
/jobs/<id>/conditions/<key>.json    one finished condition
/jobs/<id>/episodes/<key>/<seed>.*  traces and videos
/jobs/<id>/result.json              the assembled result`;

export default function CloudRunsPage() {
  return (
    <DocPage
      href={href}
      toc={toc}
      lead="A cloud run tests a public Hugging Face model on a hosted suite without installing anything. Each condition runs in its own GPU container, so the conditions of a suite run side by side."
    >
      <H2 id="what">What a cloud run is</H2>
      <P>
        You name a model and a suite in the dashboard. The web app hands the job to a
        separate service, the cloud runner. The runner downloads the model, runs every
        condition of the suite with the same engine the CLI uses, and the web app collects
        the results into an ordinary run: the same matrix, the same replays, the same
        verdicts.
      </P>
      <UL>
        <LI>
          <Strong>One container per condition.</Strong> Each condition runs on its own
          machine with one NVIDIA T4 GPU. Up to 24 run at the same time.
        </LI>
        <LI>
          <Strong>Unperturbed conditions run first.</Strong> Their action traces are the
          reference for{" "}
          <A href="/docs/statistics#first-divergence">first-divergence detection</A> in the
          others.
        </LI>
        <LI>
          <Strong>Results arrive as conditions finish.</Strong> The run page collects
          finished conditions while it is open, a few at a time.
        </LI>
        <LI>
          <Strong>Videos are kept for failures</Strong>, as with the default of{" "}
          <C>shakedown run</C>.
        </LI>
      </UL>
      <P>
        A cloud run is the fastest way to a first result for a model it supports. It is not
        a replacement for running the CLI: your own scenes, private checkpoints and served
        policies need your own machine.
      </P>

      <H2 id="can-test">What can be tested</H2>
      <P>A model can be tested in the cloud when all three are true:</P>
      <UL>
        <LI>
          It is a <Strong>public</Strong> model on the Hugging Face Hub, given as{" "}
          <C>owner/name</C>. The runner has no credentials for private or gated models.
        </LI>
        <LI>
          It is a LeRobot checkpoint. See{" "}
          <A href="/docs/policies#lerobot">which policy types have been run</A>.
        </LI>
        <LI>
          It was <Strong>trained on the task of a hosted suite</Strong>: the simulated ALOHA
          transfer-cube task or the simulated ALOHA insertion task.
        </LI>
      </UL>

      <H3 id="cannot-test">What cannot</H3>
      <Callout kind="warning" title="A policy trained on a real robot cannot be tested in the cloud">
        <p>
          The cloud has the scenes of the hosted suites and nothing else. It has no copy of
          your robot, your cameras or your workcell. A policy trained on real-robot data
          expects images and states that none of the hosted scenes produce, and a run
          against one would measure nothing useful.
        </p>
      </Callout>
      <UL>
        <LI>Private or gated models, and checkpoints on your own disk.</LI>
        <LI>
          Policies served over HTTP. A cloud run takes a <C>lerobot:</C> model only.
        </LI>
        <LI>Your own scenario files, scanned scenes or environments.</LI>
      </UL>
      <P>
        Nothing checks that a model was trained on the task you choose. A model trained on
        another task loads if its inputs happen to fit, and then fails every condition. If a
        first run shows success near zero in the unperturbed condition, the model and the
        suite do not belong together.
      </P>

      <H2 id="suites">Hosted suites</H2>
      <DocTable
        caption="Suites the cloud runner has scenes for"
        head={["Suite", "Conditions", "Accepts", "Example model"]}
        numeric={[1]}
        rows={[
          [
            "aloha-transfer-cube",
            "19",
            "Policies trained on the simulated ALOHA transfer-cube task.",
            <C key="m">lerobot/act_aloha_sim_transfer_cube_human</C>,
          ],
          [
            "aloha-latency",
            "6",
            "The same policies, tested against action delay alone.",
            <C key="m">lerobot/act_aloha_sim_transfer_cube_human</C>,
          ],
          [
            "aloha-insertion-latency",
            "4",
            "Policies trained on the simulated ALOHA insertion task, tested against action delay.",
            <C key="m">lerobot/act_aloha_sim_insertion_human</C>,
          ],
        ]}
      />
      <P>
        PushT is not offered on the cloud. It runs on your own machine, but it did not finish
        on the cloud runner in testing, and the cause has not been found.
      </P>
      <P>
        These are the suites in the repository’s <C>scenarios/</C> directory, as they were
        when the runner was deployed. The scenario files are described in{" "}
        <A href="/docs/scenarios#bundled">Scenarios</A>.
      </P>

      <H2 id="start">Starting a run</H2>
      <Steps>
        <Step n={1} title="Open New run">
          In a project you can write to, open Runs, then New run. If the page says that cloud
          runs are not configured, the server has no runner. Use the CLI.
        </Step>
        <Step n={2} title="Name the model and the suite">
          Enter the model as <C>owner/name</C>. A full <C>huggingface.co</C> URL is accepted
          and shortened. Choose the suite that matches the task the model was trained on.
        </Step>
        <Step n={3} title="Choose the size">
          Episodes per condition, from 1 to 50. The form starts at 20. The label is optional
          and names the column in the matrix.
        </Step>
        <Step n={4} title="Set runtime settings, or leave them empty">
          Actions executed per plan, and whether to compensate for action delay. Empty means
          the model as published. The settings become part of the policy spec of the run.
          See <A href="/docs/runtime-settings">Runtime settings</A>.
        </Step>
      </Steps>
      <P>
        The delay option sets <C>latency_compensation=auto</C>. Actions per plan sets{" "}
        <C>n_action_steps</C>, a whole number from 1 to 1000. Other options of a policy spec
        cannot be set from the form.
      </P>

      <H2 id="limits">Limits</H2>
      <DocTable
        caption="Limits of cloud runs"
        head={["Limit", "Value", "Set in"]}
        monoFirst={false}
        rows={[
          [
            "Episodes per condition, per run",
            "50",
            <>
              <C>MAX_HOSTED_EPISODES</C> in <C>apps/web/src/lib/cloud.ts</C>, and{" "}
              <C>MAX_EPISODES</C> in <C>cloud/modal_app.py</C>
            </>,
          ],
          [
            "Episodes per account, per calendar month",
            "5,000",
            <>
              <C>MONTHLY_EPISODE_ALLOWANCE</C> in <C>apps/web/src/lib/cloud.ts</C>
            </>,
          ],
          [
            "Conditions per run",
            "40",
            <>
              <C>MAX_CONDITIONS</C> in <C>cloud/modal_app.py</C>
            </>,
          ],
          ["Time for one condition", "40 minutes", "The runner. A condition is retried once."],
          ["Time for a whole run", "90 minutes", "The runner."],
        ]}
      />
      <UL>
        <LI>
          A run costs its number of conditions times its episodes per condition. The full
          ALOHA suite at 50 episodes costs 950 episodes, so the monthly allowance covers
          five such runs.
        </LI>
        <LI>
          The allowance is counted per account, across projects, from the first day of the
          month in UTC. Runs that failed are not counted.
        </LI>
        <LI>
          A run that would exceed what is left is refused before it starts, with the number
          of episodes it needs and the number left.
        </LI>
      </UL>

      <H2 id="baselines">What a cloud run is compared with</H2>
      <P>
        A cloud run is compared with the latest completed <Strong>cloud run of the same
        suite and the same number of episodes</Strong> in the project. It is never compared
        with a run uploaded from your own machine.
      </P>
      <P>
        The reason is rendering. The same scene rendered on different GPUs and drivers gives
        slightly different images, and those differences can change how an episode ends. A
        comparison between a laptop and a cloud GPU would measure the machines as well as
        the policies. See <A href="/docs/limitations#rendering">Limitations</A>.
      </P>
      <UL>
        <LI>The first cloud run of a suite at a given size has no baseline.</LI>
        <LI>
          A run at 20 episodes and a run at 50 are not compared with each other. Choose one
          size and keep it.
        </LI>
        <LI>
          The baseline is the latest such run whatever model it tested. Testing an unrelated
          model in between changes what the next run is compared with.
        </LI>
      </UL>

      <H2 id="data">What the runner downloads and keeps</H2>
      <UL>
        <LI>
          <Strong>The weights of the model are downloaded by the runner</Strong> from the
          Hugging Face Hub, and cached on the runner so that the next run of the same model
          starts faster. The model is public, so nothing confidential is involved. This is
          the reason private models are not supported: for those, run the CLI on your own
          machine, where the weights never leave it.
        </LI>
        <LI>
          The runner keeps each job’s results, traces and videos on its own storage. The web
          app copies them into the project’s storage.
        </LI>
        <LI>
          The runner never talks to the database. It receives a job, and answers when
          asked.
        </LI>
      </UL>

      <H2 id="self-hosting">Hosting the runner yourself</H2>
      <P>
        The runner is one file, <C>cloud/modal_app.py</C>, that deploys to{" "}
        <A href="https://modal.com">Modal</A>. A self-hosted Shakedown server has no cloud
        runs until you deploy it and tell the web app where it is.
      </P>
      <CodeBlock lang="shell" code={deploy} />
      <P>
        The secret must be named <C>shakedown-cloud</C> and hold{" "}
        <C>SHAKEDOWN_CLOUD_TOKEN</C>. Then set two environment variables for the web app, and
        restart it:
      </P>
      <CodeBlock lang="shell" filename="Environment of the web app" code={env} />
      <DocTable
        caption="Environment variables of the web app for cloud runs"
        head={["Variable", "Meaning"]}
        rows={[
          ["SHAKEDOWN_CLOUD_URL", "Base URL of the deployed runner."],
          [
            "SHAKEDOWN_CLOUD_TOKEN",
            "The bearer token the web app sends. Must equal the value in the Modal secret.",
          ],
        ]}
      />
      <P>
        Cloud runs are offered in the dashboard only when both are set. To check the runner:
      </P>
      <CodeBlock lang="shell" code={health} />
      <CodeBlock lang="json" filename="Response" code={healthOut} />
      <UL>
        <LI>
          Deploy from the root of the repository. The deployment copies{" "}
          <C>engine/src/shakedown</C> and <C>scenarios/</C> into the runner’s image. After a
          change to the engine or to a hosted suite, deploy again.
        </LI>
        <LI>
          The hosted suites are fixed in two places, <C>HOSTED_SUITES</C> in{" "}
          <C>cloud/modal_app.py</C> and in <C>apps/web/src/lib/cloud.ts</C>. Adding a suite
          means changing both, including its number of conditions.
        </LI>
        <LI>
          The runner pins <C>lerobot</C> to one version. Runs made before and after that pin
          changes should not be compared.
        </LI>
        <LI>You pay Modal for the GPU time. The allowance above limits it per account.</LI>
      </UL>

      <H3 id="runner-api">The runner’s routes</H3>
      <P>
        These are called by the web app, not by you. Every route but <C>/health</C> needs the
        bearer token.
      </P>
      <DocTable
        caption="Routes of the cloud runner"
        head={["Route", "Purpose"]}
        rows={[
          ["GET /health", "The hosted suites and the episode limit. No token needed."],
          [
            "POST /jobs",
            "Start a job: job id, policy, suite, label, episodes and an optional baseline. Answers 409 when the job exists.",
          ],
          ["GET /jobs/{id}", "State of the job and the keys of its finished conditions."],
          [
            "GET /jobs/{id}/conditions/{key}",
            "One finished condition with its traces and videos, base64-encoded.",
          ],
          ["GET /jobs/{id}/result", "The assembled result without its conditions. 404 until the job has finished."],
        ]}
      />
      <CodeBlock filename="Layout of a job on the runner’s volume" code={volume} />

      <H2 id="status">Status</H2>
      <UL>
        <LI>
          If any condition cannot be run, the whole job is marked failed, with the error of
          the first such condition. The conditions that did finish remain in the run.
        </LI>
        <LI>
          Collection happens while a run page is open. A run whose page nobody opens stays
          in progress in the dashboard although the runner has finished.
        </LI>
        <LI>
          Only ACT and Diffusion Policy checkpoints have been run. See{" "}
          <A href="/docs/limitations">Limitations</A>.
        </LI>
      </UL>
    </DocPage>
  );
}
