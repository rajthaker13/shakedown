import { CodeBlock } from "@/components/docs/code-block";
import { DocPage } from "@/components/docs/doc-page";
import { pageMetadata } from "@/components/docs/nav";
import { A, C, Callout, H2, H3, LI, P, Strong, UL } from "@/components/docs/prose";
import { DocTable } from "@/components/docs/table";
import type { TocItem } from "@/components/docs/toc";

const href = "/docs/releases";

export const metadata = pageMetadata(href);

const toc: TocItem[] = [
  { id: "what", title: "What a release is" },
  { id: "not", title: "What Shakedown does not do", level: 3 },
  { id: "stages", title: "Stages" },
  { id: "moves", title: "Allowed moves", level: 3 },
  { id: "creating", title: "Creating a release" },
  { id: "test-gate", title: "Gate: candidate to canary" },
  { id: "field-gate", title: "Gate: canary to fleet" },
  { id: "thresholds", title: "Where the thresholds are set" },
  { id: "override", title: "Overriding a gate" },
  { id: "one-per-stage", title: "One release per stage" },
  { id: "rollback", title: "Rollback" },
  { id: "robot", title: "The robot’s side" },
  { id: "channels", title: "Channels", level: 3 },
  { id: "record", title: "The record" },
  { id: "status", title: "Status" },
];

const cli = `export SHAKEDOWN_URL="https://shakedown.example.com"
export SHAKEDOWN_API_KEY="shk_..."

shakedown release --channel fleet`;

const cliOut = `#7 act-chunk50 (fleet)
  policy   lerobot:lerobot/act_aloha_sim_transfer_cube_human?n_action_steps=50
  settings {'n_action_steps': 50}`;

const curl = `curl -H "Authorization: Bearer $SHAKEDOWN_API_KEY" \\
  "$SHAKEDOWN_URL/api/v1/release?channel=canary"`;

const response = `{
  "channel": "canary",
  "release": {
    "number": 7,
    "stage": "fleet",
    "policy_label": "act-chunk50",
    "policy_spec": "lerobot:lerobot/act_aloha_sim_transfer_cube_human?n_action_steps=50",
    "runtime_config": { "n_action_steps": 50 },
    "stage_changed_at": "2026-03-04T14:02:11+00:00"
  }
}`;

const python = `from shakedown.field import FieldClient

client = FieldClient()                  # reads SHAKEDOWN_URL and SHAKEDOWN_API_KEY
release = client.release("fleet")       # None when the channel has no release

if release is not None:
    print(release.number, release.policy_spec, release.runtime_config)
    # Loading that checkpoint with those settings is your deployment code's job.`;

export default function ReleasesPage() {
  return (
    <DocPage
      href={href}
      toc={toc}
      lead="A release pins a checkpoint together with its runtime settings and the test run that justified it. It moves from candidate to canary to fleet, and each promotion has a gate: a fixed set of checks on the evidence."
    >
      <H2 id="what">What a release is</H2>
      <DocTable
        caption="What a release records"
        head={["Field", "Meaning"]}
        rows={[
          ["number", "Counts up from 1 within the project. Releases are referred to as #1, #2 and so on."],
          ["policy_label", "The label of the run it was made from."],
          ["policy_spec", "The policy spec of that run, including its options."],
          [
            "runtime_config",
            <>
              The runtime settings read out of the spec: <C>n_action_steps</C>,{" "}
              <C>temporal_ensemble_coeff</C> and <C>latency_compensation</C>, where the spec
              sets them. Empty means as published.
            </>,
          ],
          ["run", "The test run that the release rests on."],
          ["stage", "Where the release is in the pipeline."],
          ["notes", "Free text given when it was created."],
        ]}
      />

      <H3 id="not">What Shakedown does not do</H3>
      <Callout kind="warning" title="Shakedown does not push anything to robots">
        <p>
          Shakedown does not copy weights, install code, restart a process or connect to a
          robot. It keeps the record of which release is approved for which channel, and it
          answers one question: which release should I run. Fetching the checkpoint, loading
          it with the recorded settings and switching over safely are the job of your own
          deployment tooling.
        </p>
      </Callout>
      <P>
        Moving a release to the fleet stage therefore changes an answer, not a robot. A robot
        runs the new release when your tooling next asks and acts on what it is told.
      </P>

      <H2 id="stages">Stages</H2>
      <DocTable
        caption="Stages of a release"
        head={["Stage", "Meaning"]}
        rows={[
          ["candidate", "Created from a test run. Not approved for any robot."],
          ["canary", "On trial on a few robots. Answered on the canary channel."],
          ["fleet", "Approved for every robot. Answered on the fleet channel."],
          ["retired", "Withdrawn as a candidate, or replaced in its stage by a later release."],
          ["rolled_back", "Taken out of canary or fleet because it did not hold up."],
        ]}
      />

      <H3 id="moves">Allowed moves</H3>
      <DocTable
        caption="Moves between stages"
        head={["From", "To", "Needs"]}
        rows={[
          ["candidate", "canary", "The test gate, or an override."],
          ["candidate", "retired", "A reason of at least 3 characters."],
          ["canary", "fleet", "The field gate, or an override."],
          ["canary", "rolled_back", "A reason of at least 3 characters."],
          ["fleet", "rolled_back", "A reason of at least 3 characters."],
        ]}
      />
      <P>
        No other move exists. A release cannot skip canary, and a retired or rolled-back
        release does not come back, with one exception described under{" "}
        <A href="#rollback">Rollback</A>. To try again, create a new release. Moving a
        release needs write access to the project.
      </P>

      <H2 id="creating">Creating a release</H2>
      <P>
        A release is created from a run, on the run’s page. The run must be completed. A run
        that ended with the verdict ERROR counts as failed and cannot become a release. The
        run may have been uploaded from the CLI or made in the cloud.
      </P>
      <P>
        The release copies the run’s label and policy spec. Its runtime settings are read
        from the options of the spec, so they are the settings that were tested. There is no
        way to edit them afterwards: a different setting is a different run and a different
        release.
      </P>

      <H2 id="test-gate">Gate: candidate to canary</H2>
      <P>The release must rest on a clean test run. All four checks must pass.</P>
      <DocTable
        caption="Checks of the test gate"
        head={["Check", "Passes when"]}
        monoFirst={false}
        rows={[
          [
            "Backed by a completed test run",
            "The run is completed and has at least one condition. A release whose run was deleted fails this check, and it is then the only check shown.",
          ],
          ["No condition failed", "No condition has the verdict FAIL or ERROR. WARN and SKIP pass."],
          [
            "No regression against the baseline",
            "No condition has a regression check with the verdict FAIL.",
          ],
          [
            "At least 20 episodes per condition",
            <>
              Every condition has at least <C>min_episodes</C> episodes.
            </>,
          ],
        ]}
      />
      <UL>
        <LI>
          <Strong>A run without a baseline passes the regression check.</Strong> There is
          nothing to regress against. The check says so in its detail: “The run had no
          baseline, so regressions could not be checked.” Read the detail, not only the
          mark.
        </LI>
        <LI>
          <Strong>WARN passes.</Strong> A condition that looked bad but could not be
          separated from noise does not block the gate.
        </LI>
        <LI>
          The gate reads the verdicts stored with the run. It does not re-run anything, and
          it does not look at how the success rates compare with any other release.
        </LI>
      </UL>

      <H2 id="field-gate">Gate: canary to fleet</H2>
      <P>
        The release must have held up on robots. The evidence is the{" "}
        <A href="/docs/field">field reports</A> that name the release.
      </P>
      <DocTable
        caption="Checks of the field gate"
        head={["Check", "Passes when"]}
        monoFirst={false}
        rows={[
          [
            "At least 30 field episodes as a canary",
            <>
              The release has at least <C>min_field_episodes</C> reported attempts.
            </>,
          ],
          [
            "Not worse than the fleet release by more than 10 points",
            <>
              It is <Strong>not</Strong> the case that the canary’s success rate is more than{" "}
              <C>max_field_drop_pts</C> points below the fleet release’s and a one-sided
              Fisher exact test gives p below 0.05.
            </>,
          ],
        ]}
      />
      <UL>
        <LI>
          The second check fails only when both hold: the drop exceeds the threshold and it
          is statistically clear. A large drop on few episodes passes.
        </LI>
        <LI>
          When there is no fleet release, or the fleet release has no field reports, the
          second check passes and says that there was nothing to compare with.
        </LI>
        <LI>
          Success is what the reports say. Interventions are counted and shown, but no check
          uses them.
        </LI>
        <LI>
          The two releases are compared over all their reports, whenever and wherever they
          were made. The robots that run the canary are not the robots that run the fleet
          release, so part of a difference can be the robots. The Field page shows rates by
          robot and by site.
        </LI>
      </UL>
      <Callout kind="warning" title="Simulated reports count">
        <p>
          The gate does not tell reports marked as simulated from real ones. Attempts
          reported by <C>shakedown field simulate</C> count towards the 30 episodes and
          towards the comparison. Use a separate project to try the pipeline with the
          stand-in, and do not promote a release on simulated reports.
        </p>
      </Callout>

      <H2 id="thresholds">Where the thresholds are set</H2>
      <DocTable
        caption="Thresholds of the gates"
        head={["Setting", "Default", "Used by", "Set in"]}
        rows={[
          [
            "min_episodes",
            "20",
            "Test gate",
            "The project’s settings page. The same value is used by the dashboard’s displays.",
          ],
          [
            "min_field_episodes",
            "30",
            "Field gate",
            "The project’s settings record. The settings page has no field for it yet.",
          ],
          [
            "max_field_drop_pts",
            "10",
            "Field gate",
            "The project’s settings record. The settings page has no field for it yet.",
          ],
        ]}
      />
      <P>
        The thresholds are per project. The significance level of the field gate, 0.05, is
        fixed in <C>apps/web/src/lib/pipeline/gates.ts</C>, where the checks are implemented
        as pure functions of the evidence: the same evidence always gives the same answer.
        Until the settings page has fields for the two field thresholds, changing them means
        editing the <C>settings</C> column of the project in the database.
      </P>

      <H2 id="override">Overriding a gate</H2>
      <P>
        A gate that is not met can be overridden by a member with write access. Gates exist
        to make the decision visible, not to make it for you.
      </P>
      <UL>
        <LI>
          An override needs a reason of <Strong>at least 10 characters</Strong>.
        </LI>
        <LI>
          The reason is recorded with the move, together with{" "}
          <Strong>every check of the gate and its outcome as it stood at that moment</Strong>,
          and the move is marked as overridden.
        </LI>
        <LI>The record cannot be edited afterwards.</LI>
      </UL>
      <P>
        Without the override, a move whose gate is not met is refused with the list of
        checks that failed. When the gate is met, no reason is required.
      </P>

      <H2 id="one-per-stage">One release per stage</H2>
      <P>
        A project has at most one canary release and at most one fleet release. When a
        release moves into canary or fleet, the release that held that stage is retired, with
        the reason “Replaced by release #N.”
      </P>

      <H2 id="rollback">Rollback</H2>
      <P>
        Rolling back takes a release out of canary or fleet. It needs a reason and no gate.
      </P>
      <DocTable
        caption="What a rollback does"
        head={["Rolled back from", "Effect"]}
        rows={[
          [
            "fleet",
            "The release that it replaced in the fleet stage is restored to fleet, with the reason “Restored after release #N was rolled back.” If it replaced nothing, the fleet channel has no release.",
          ],
          [
            "canary",
            "Nothing is restored. The canary channel falls back to the fleet release.",
          ],
        ]}
      />
      <P>
        What is restored is always the release that the rolled-back release itself replaced,
        found through the recorded reason “Replaced by release #N.” Check the fleet channel
        after a rollback, with <C>shakedown release</C> or on the Releases page, before your
        tooling acts on it.
      </P>

      <H2 id="robot">The robot’s side</H2>
      <P>
        A robot, or the tooling that deploys to it, asks which release to run. The call needs
        a project API key. The host below is a placeholder.
      </P>
      <CodeBlock lang="shell" code={cli} />
      <CodeBlock filename="Example output" code={cliOut} />
      <P>
        <C>shakedown release</C> exits with code 0 when the channel has a release, 1 when it
        has none, and 2 when the server cannot be reached or refuses the key.{" "}
        <C>--json</C> prints the release as JSON, or <C>null</C>.
      </P>
      <CodeBlock lang="shell" filename="The same, over HTTP" code={curl} />
      <CodeBlock lang="json" filename="Response" code={response} />
      <CodeBlock lang="python" filename="The same, from Python" code={python} />

      <H3 id="channels">Channels</H3>
      <DocTable
        caption="What each channel answers"
        head={["Channel", "Answer"]}
        rows={[
          ["fleet", "The fleet release, or none."],
          [
            "canary",
            "The canary release. When there is none, the fleet release. When there is neither, none.",
          ],
        ]}
      />
      <P>
        A robot on the canary channel therefore always has something to run as long as the
        fleet has, and returns to the fleet release by itself when a canary is rolled back or
        promoted. The <C>stage</C> in the answer says which of the two it got: in the example
        response above, the canary channel answered with a fleet release.
      </P>
      <P>
        Which robots are canaries is your decision. Shakedown does not know your robots: a
        robot is a canary because it asks for the canary channel.
      </P>

      <H2 id="record">The record</H2>
      <P>
        Every change of stage is stored as an event: the release, the stage it left and the
        stage it entered, who made the move, the reason, the checks of the gate with their
        outcomes, and whether the gate was overridden. Events are never edited. The Releases
        page shows them with each release.
      </P>

      <H2 id="status">Status</H2>
      <UL>
        <LI>
          The release flow has been tested with synthetic and simulated field reports only.
          It has not been used to release a policy to a physical robot.
        </LI>
        <LI>
          A release does not verify the checkpoint. It records a policy spec, and a Hub id
          or a path can point at different weights later. The run stores the SHA-256 hash of
          the weights it tested, under the policy’s information, when the weights file was
          found. Compare it in your deployment tooling.
        </LI>
      </UL>
    </DocPage>
  );
}
