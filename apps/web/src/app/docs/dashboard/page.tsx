import { CodeBlock } from "@/components/docs/code-block";
import { DocPage } from "@/components/docs/doc-page";
import { pageMetadata } from "@/components/docs/nav";
import { A, C, Callout, H2, H3, LI, P, Strong, UL } from "@/components/docs/prose";
import { DocTable } from "@/components/docs/table";
import type { TocItem } from "@/components/docs/toc";

const href = "/docs/dashboard";

export const metadata = pageMetadata(href);

const toc: TocItem[] = [
  { id: "overview", title: "Overview" },
  { id: "configure", title: "Point the CLI at your server" },
  { id: "uploading", title: "Uploading" },
  { id: "during-a-run", title: "During a run", level: 3 },
  { id: "after-a-run", title: "After a run", level: 3 },
  { id: "api-keys", title: "API keys" },
  { id: "what-is-uploaded", title: "What is uploaded" },
  { id: "what-is-not", title: "What is not uploaded", level: 3 },
  { id: "deleting", title: "Deleting data" },
  { id: "views", title: "Dashboard views" },
  { id: "account", title: "Signing in and passwords" },
];

const configure = `export SHAKEDOWN_URL="https://shakedown.example.com"
export SHAKEDOWN_API_KEY="shk_..."`;

const during = `shakedown run scenarios/aloha-transfer-cube \\
  --policy lerobot:lerobot/act_aloha_sim_transfer_cube_human \\
  --label v2 \\
  --upload \\
  --baseline-branch main`;

const duringOut = `uploading to https://shakedown.example.com · project transfer-cube`;

const after = `shakedown upload runs/20260301-101500-v2`;

const afterOut = `uploaded https://shakedown.example.com/app/acme/transfer-cube/runs/42`;

export default function DashboardPage() {
  return (
    <DocPage
      href={href}
      toc={toc}
      lead="The dashboard stores runs and shows them as a matrix of policy versions against conditions, with a replay of every recorded episode. This page covers uploading, API keys, and what leaves your machine."
    >
      <H2 id="overview">Overview</H2>
      <P>
        The CLI works without the dashboard. Every result is written to a local run directory,
        and <C>--baseline</C> compares runs from files. Uploading adds a shared history: the
        team sees every run, a pull request job can use the latest run on <C>main</C> as its
        baseline, and failures can be replayed in the browser.
      </P>

      <H2 id="configure">Point the CLI at your server</H2>
      <P>
        The CLI never assumes a server address. Set the base URL of your Shakedown server and
        an API key, as environment variables or with <C>--url</C> and <C>--api-key</C>. The
        host below is a placeholder.
      </P>
      <CodeBlock lang="shell" code={configure} />
      <P>
        Without a URL or a key, a command that uploads stops with an error and exit code 2
        before it runs anything.
      </P>

      <H2 id="uploading">Uploading</H2>

      <H3 id="during-a-run">During a run</H3>
      <P>
        With <C>--upload</C>, <C>shakedown run</C> creates the run on the server before the
        first episode, then sends each condition as it finishes. The dashboard fills in while
        the run is still going.
      </P>
      <CodeBlock lang="shell" code={during} />
      <CodeBlock filename="Example output, first line" code={duringOut} />
      <UL>
        <LI>
          The first line confirms the server and the project that the key belongs to. Check it
          when you use several projects.
        </LI>
        <LI>
          After the run, the CLI prints a <C>dashboard:</C> line with the URL of the run. The
          same URL is added to the Markdown summary.
        </LI>
        <LI>
          If a condition fails to upload, the CLI prints a warning and the run continues. The
          local result is unaffected.
        </LI>
      </UL>

      <H3 id="after-a-run">After a run</H3>
      <P>
        <C>shakedown upload</C> sends a finished run directory in one go. Use it for runs made
        without <C>--upload</C>.
      </P>
      <CodeBlock lang="shell" code={after} />
      <CodeBlock filename="Example output" code={afterOut} />
      <P>
        A run keeps the id it was given when it was created. Uploading the same directory
        again, for example after an upload that was interrupted, reopens that run and replaces
        its conditions and files. It does not create a duplicate. This works only within the
        project the run belongs to.
      </P>

      <H2 id="api-keys">API keys</H2>
      <P>
        An API key lets the CLI write runs to one project. Create keys in the project’s
        settings, under API keys.
      </P>
      <UL>
        <LI>
          <Strong>Project-scoped.</Strong> A key belongs to one project. Runs uploaded with it
          go to that project, and baselines are looked up in that project only.
        </LI>
        <LI>
          <Strong>Shown once.</Strong> The full key is displayed when it is created and never
          again. Copy it then. If it is lost, create a new key and revoke the old one.
        </LI>
        <LI>
          <Strong>Stored as a hash.</Strong> The server stores the SHA-256 hash of the key and
          a short prefix that identifies it in the list of keys. The key itself is not stored
          and cannot be recovered from the server.
        </LI>
        <LI>
          <Strong>Revocable.</Strong> A revoked key is rejected immediately. Anything that
          still uses it stops uploading.
        </LI>
      </UL>
      <P>
        Keys start with <C>shk_</C>. The CLI sends the key in the <C>Authorization</C> header
        as a bearer token, so use an <C>https</C> URL for any server that is not on your own
        machine. In CI, store the key as a secret. See{" "}
        <A href="/docs/ci#secrets">Running in CI</A>.
      </P>

      <H2 id="what-is-uploaded">What is uploaded</H2>
      <P>Two kinds of data leave your machine, by two different routes.</P>
      <DocTable
        caption="What is uploaded and where it goes"
        head={["Data", "Goes to", "Contains"]}
        monoFirst={false}
        rows={[
          [
            "Results",
            "The server’s API",
            "The run header, then one record per condition with a summary of each episode.",
          ],
          [
            "Episode traces and videos",
            "Object storage, directly",
            "The per-step trace of each episode as JSON, and the replay videos that were kept as MP4.",
          ],
        ]}
      />
      <P>
        Videos and traces do not pass through the API. For each batch of files the CLI asks the
        API for upload URLs, and the API answers with short-lived signed URLs, each valid for
        one file path inside that run. The CLI then sends each file straight to object
        storage. The API key is not sent to object storage.
      </P>
      <P>In detail, the results contain:</P>
      <DocTable
        caption="Contents of an uploaded result"
        head={["Part", "Fields"]}
        monoFirst={false}
        rows={[
          [
            "Run",
            "Suite name, policy label, policy spec, engine version, start and end time, duration, verdict and summary counts, and the id and label of the baseline.",
          ],
          [
            "Policy information",
            "For a LeRobot checkpoint: policy type, checkpoint name, device, precision, number of parameters, inference options, and the SHA-256 hash of the weights file when it is found locally. For a served policy: its URL and its /info response.",
          ],
          [
            "Git",
            "Commit SHA, branch, commit subject, whether the checkout had uncommitted changes, repository name and pull request number.",
          ],
          ["Host", "Platform string, Python version and machine architecture."],
          [
            "Condition",
            "Key, label, description, environment, tags, perturbations and their parameters, fingerprint, success count and rate, number of errored episodes, interval, checks with their messages, the comparison with the baseline, contact counts, failure labels, per-seed outcomes, and the source text of the scenario file.",
          ],
          [
            "Episode",
            "Seed, outcome, steps, highest reward, duration, failure label, first divergent step, whether the same seed succeeds with no perturbation, first step of each contact group, and any error message.",
          ],
        ]}
      />

      <P>
        Real-robot trials are a third kind of data. They are uploaded only by{" "}
        <C>shakedown real correlate --upload</C>, and contain the suite, policy label, robot,
        condition key, trial number, outcome, operator, note and time of each trial. Trials
        from different robots are stored separately.
      </P>

      <H3 id="what-is-not">What is not uploaded</H3>
      <UL>
        <LI>
          <Strong>Model weights.</Strong> The checkpoint is never uploaded. Only a hash of the
          weights file is, which identifies the checkpoint without revealing it.
        </LI>
        <LI>
          <Strong>Training data.</Strong> Shakedown does not read it.
        </LI>
        <LI>
          <Strong>Videos that were not kept.</Strong> With <C>--videos none</C> there are no
          videos to upload. Traces are still uploaded.
        </LI>
        <LI>
          <Strong>The nominal action traces</Strong> in the run directory’s{" "}
          <C>nominal/</C> folder.
        </LI>
      </UL>
      <Callout kind="warning" title="Videos show your scene">
        <p>
          Replay videos contain rendered images of the simulated workcell and the policy’s
          camera view. The policy spec and the commit subject are uploaded as text. If a local
          checkpoint path or a commit message is sensitive, set <C>--label</C> and check what
          the spec contains before you upload. A <C>scanned_scene</C> shows your real
          workcell’s geometry in every video, and its path is uploaded with the perturbation’s
          parameters.
        </p>
      </Callout>

      <H2 id="deleting">Deleting data</H2>
      <P>
        A member of the project can delete a run from the run’s page. Deleting a run also
        deletes its stored videos and traces from object storage. Deleting a project deletes
        every run in it, with their videos and traces. Neither can be undone. The local run
        directory is not touched, so a deleted run can be uploaded again with{" "}
        <C>shakedown upload</C>.
      </P>

      <H2 id="views">Dashboard views</H2>
      <DocTable
        caption="Views of the dashboard"
        head={["View", "Shows"]}
        monoFirst={false}
        rows={[
          [
            "Matrix",
            "The home of a project. Policy versions against conditions for one suite, one cell per result, so a condition that got worse stands out along its row. In the Change view, strong color is used only for changes that are statistically clear. A change that is large but not clear gets a faint tint.",
          ],
          [
            "New run",
            <>
              Start a <A href="/docs/cloud-runs">cloud run</A> of a public model on a hosted
              suite, with its runtime settings, or see the command for a run on your own
              machine. Shows the cloud episodes left this month.
            </>,
          ],
          [
            "Run detail",
            "One run: its verdict, the policy and commit it tested, its baseline, and a row per condition with the success rate, interval, change and the message of each check. A condition opens its list of episodes.",
          ],
          [
            "Checkpoint comparison",
            "Two completed runs side by side, condition by condition, with the seeds that broke and the seeds that were fixed.",
          ],
          [
            "Episode replay",
            "The video of one episode with its signals on a timeline. The first divergent step is marked, and the signals of the unperturbed episode on the same seed are shown for reference when they are available.",
          ],
          [
            "Releases",
            <>
              Every release with its stage, its runtime settings, the checks of its next
              gate with their current outcome, and the record of its moves. Releases are
              created from a run’s page. See <A href="/docs/releases">Releases and gates</A>.
            </>,
          ],
          [
            "Field",
            <>
              Attempts reported by robots: success rate and interventions by release, by
              robot and by site, groups that are below the rest, the conditions robots
              measured, and the tests proposed from them. States how many reports come from
              a simulated stand-in. See <A href="/docs/field">Field reporting</A>.
            </>,
          ],
          [
            "Sim-to-real",
            <>
              Simulated success rates against the real trials uploaded with{" "}
              <C>shakedown real correlate --upload</C>, with the Pearson correlation and MMRV.
              See <A href="/docs/sim-to-real">Sim-to-real validation</A>.
            </>,
          ],
          [
            "Scenario viewer",
            "The scenario files of the project as they were uploaded with the runs, with the conditions each one expands into.",
          ],
        ]}
      />
      <P>
        The first divergent step marks where to start looking, not the cause of the failure.
        See <A href="/docs/statistics#first-divergence">first-divergence detection</A>.
      </P>

      <H2 id="account">Signing in and passwords</H2>
      <UL>
        <LI>
          A new account has to confirm its email address before it can sign in.
        </LI>
        <LI>
          A forgotten password is reset from the sign-in page. The page answers the same way
          whether or not the address has an account, so it cannot be used to find out who
          has one. The link in the email opens a page to set a new password of at least 8
          characters.
        </LI>
        <LI>Reset requests are limited to 5 per hour from one network address.</LI>
        <LI>
          API keys are separate from passwords. Changing a password does not revoke a key.
        </LI>
      </UL>
    </DocPage>
  );
}
