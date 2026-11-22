import { CodeBlock } from "@/components/docs/code-block";
import { DocPage } from "@/components/docs/doc-page";
import { pageMetadata } from "@/components/docs/nav";
import { A, C, Callout, H2, H3, LI, P, Strong, UL } from "@/components/docs/prose";
import { DocTable } from "@/components/docs/table";
import type { TocItem } from "@/components/docs/toc";

const href = "/docs/field";

export const metadata = pageMetadata(href);

const toc: TocItem[] = [
  { id: "status", title: "Status" },
  { id: "what", title: "What field reporting is" },
  { id: "sdk", title: "The SDK" },
  { id: "example", title: "A complete example", level: 3 },
  { id: "reference", title: "Methods", level: 3 },
  { id: "measured", title: "What is measured, and how" },
  { id: "never-raises", title: "Reporting never stops a robot" },
  { id: "idempotency", title: "Sending a report twice" },
  { id: "by-hand", title: "Reporting by hand" },
  { id: "suggestions", title: "From field conditions to tests" },
  { id: "rule-delay", title: "Action delay", level: 3 },
  { id: "rule-frames", title: "Dropped frames", level: 3 },
  { id: "rule-brightness", title: "Image brightness", level: 3 },
  { id: "resolving", title: "Accepting and dismissing", level: 3 },
  { id: "flagged", title: "Robots below the rest" },
  { id: "simulate", title: "A stand-in for hardware" },
  { id: "privacy", title: "What is sent" },
];

const install = `pip install -e engine`;

const example = `"""Run one attempt of the task and report it to Shakedown."""

import time

from shakedown.field import FieldClient

CONTROL_HZ = 50

client = FieldClient()                     # reads SHAKEDOWN_URL and SHAKEDOWN_API_KEY
release = client.release("fleet")          # which release should this robot run?
if release is None:
    raise SystemExit("no release is approved for the fleet")

# Loading the checkpoint with the release's settings is your code.
policy = load_policy(release.policy_spec, **release.runtime_config)
robot = connect_robot()


def attempt() -> None:
    observation = robot.reset()
    succeeded = False
    stepped_in = False

    with client.episode(
        release=release,
        robot="arm-03",
        site="line-2",
        control_hz=CONTROL_HZ,
    ) as episode:
        for _ in range(400):
            # None when a frame was expected and did not arrive.
            episode.frame(observation.image)

            with episode.inference():      # times the call and counts the step
                action = policy(observation)

            sent = time.monotonic()
            observation = robot.step(action)
            # Only if your robot can tell you when it acted on the command.
            episode.action_delay(1000.0 * (robot.acted_at - sent))

            if robot.operator_took_over:
                stepped_in = True
                break
            if robot.task_done:
                succeeded = True
                break

        episode.finish(
            success=succeeded,
            intervention=stepped_in,
            intervention_reason="cube slipped during handover" if stepped_in else "",
        )


attempt()
client.close()                             # sends anything still waiting`;

const report = `shakedown field report \\
  --policy-label act-chunk50 \\
  --release 7 \\
  --robot arm-03 \\
  --site line-2 \\
  --failure \\
  --intervention \\
  --reason "cube slipped during handover" \\
  --action-delay-ms 85`;

const suggestion = `version: 1
name: field-latency
description: Action delay as measured on robots in the field.
env: aloha/transfer_cube
episodes: 50
seed: 1000
sweep:
  name: steps
  values: [4, 6]
perturbations:
  - action_latency: { steps: "\${steps}" }
tags: [timing, from-field]`;

const robots = `robots:
  - name: sim-arm-01
    site: bench
    conditions: []
  - name: sim-arm-02
    site: bench
    conditions:
      - action_latency: { steps: 4 }
  - name: sim-arm-03
    site: dim-corner
    conditions:
      - image_adjust: { brightness: 0.6 }
      - frame_drop: { probability: 0.1 }`;

const simulate = `shakedown field simulate \\
  --policy "lerobot:lerobot/act_aloha_sim_transfer_cube_human?n_action_steps=50" \\
  --channel canary \\
  --robots robots.yaml \\
  --episodes 20`;

const simulateOut = `sim-arm-01: 15/20 succeeded
sim-arm-02: 13/20 succeeded
sim-arm-03: 9/20 succeeded
reported 60 simulated attempts`;

export default function FieldPage() {
  return (
    <DocPage
      href={href}
      toc={toc}
      lead="Field reporting tells Shakedown what happens on robots: whether each attempt succeeded, whether a person stepped in, and the conditions the robot measured. Those conditions are compared with what the test suite covers, and gaps become proposed tests."
    >
      <H2 id="status">Status</H2>
      <Callout kind="warning" title="Not yet tested on a physical robot">
        <p>
          The field SDK has been tested with synthetic reports and with a simulated
          stand-in for a robot. It has not yet run in the control loop of a physical robot.
          The measurements it takes are simple, but their cost inside a real loop, and how
          well they describe a real camera and a real network, have not been measured.
          Try it on one robot before you roll it out.
        </p>
      </Callout>

      <H2 id="what">What field reporting is</H2>
      <P>
        A test suite covers the conditions someone thought of. The field has the conditions
        that occur. Field reporting closes that loop in three ways:
      </P>
      <UL>
        <LI>
          <Strong>Evidence for releases.</Strong> The reports that name a release are what
          the <A href="/docs/releases#field-gate">field gate</A> reads before a canary goes
          to the fleet.
        </LI>
        <LI>
          <Strong>Proposed tests.</Strong> When robots measure a condition that the suite
          does not cover, Shakedown proposes a scenario for it.
        </LI>
        <LI>
          <Strong>Robots that stand out.</Strong> A robot or a site that succeeds less often
          than the rest, beyond chance, is flagged.
        </LI>
      </UL>
      <P>
        An attempt is one try at the task, from start to end. Shakedown does not observe
        the robot. It stores what your code reports, so what counts as success is decided by
        your code.
      </P>

      <H2 id="sdk">The SDK</H2>
      <P>
        The SDK is the module <C>shakedown.field</C> of the engine. It needs the base
        install only, no simulator and no LeRobot:
      </P>
      <CodeBlock lang="shell" code={install} />
      <P>
        It reads the server and the key from <C>SHAKEDOWN_URL</C> and{" "}
        <C>SHAKEDOWN_API_KEY</C>, or takes them as <C>url</C> and <C>api_key</C>. Creating a
        client without them raises <C>FieldError</C>.
      </P>

      <H3 id="example">A complete example</H3>
      <P>
        <C>load_policy</C>, <C>connect_robot</C> and the attributes of <C>robot</C> stand for
        your own code. Everything else is the SDK.
      </P>
      <CodeBlock lang="python" filename="run_attempt.py" code={example} />

      <H3 id="reference">Methods</H3>
      <DocTable
        caption="Methods of FieldClient"
        head={["Method", "Does"]}
        rows={[
          [
            "release(channel)",
            <>
              Returns the release for <C>fleet</C> or <C>canary</C>, or <C>None</C>. Raises{" "}
              <C>FieldError</C> when the server cannot be reached. This is the one call that
              raises: decide what the robot runs when it does.
            </>,
          ],
          [
            "episode(release=, policy_label=, robot=, site=, control_hz=)",
            <>
              Starts measuring one attempt. Give a release, or a <C>policy_label</C> for a
              policy that is not a release.
            </>,
          ],
          ["report(episode)", "Sends one report given as a dictionary. Returns whether everything waiting was sent."],
          ["flush()", "Tries to send the reports that are waiting."],
          ["pending", "The number of reports waiting to be sent."],
          ["close()", "Flushes and closes the connection."],
        ]}
      />
      <DocTable
        caption="Methods of an episode"
        head={["Method", "Does"]}
        rows={[
          ["inference()", "A context manager. Times one call to the policy and counts one control step."],
          [
            "step(inference_ms=None)",
            "Counts one control step, for loops that time inference themselves. Use this or inference(), not both.",
          ],
          [
            "frame(image)",
            <>
              Records one camera frame. Pass <C>None</C> when a frame was expected and did
              not arrive.
            </>,
          ],
          ["action_delay(milliseconds)", "Records the delay you measured. The last value given is reported."],
          [
            "finish(success=, intervention=, intervention_reason=, note=)",
            "Ends the attempt and sends the report. Later calls do nothing.",
          ],
        ]}
      />
      <P>
        Used as a context manager, an episode that ends without <C>finish</C>, because of an
        exception or a forgotten call, is reported as a failure with the note “ended without
        a result”, followed by the name of the exception if there was one. The exception
        itself is not swallowed.
      </P>

      <H2 id="measured">What is measured, and how</H2>
      <DocTable
        caption="Measurements in a field report"
        head={["Field", "How it is measured", "Reported when"]}
        rows={[
          [
            "inference_ms",
            "The median over the attempt of the time each policy call took, in milliseconds.",
            "At least one call was timed.",
          ],
          [
            "image_brightness",
            "The mean pixel value of each frame, on the 0 to 255 scale, taken from a sparse sample: every 8th pixel in each direction. Then the mean over the frames of the attempt.",
            "At least one frame was recorded.",
          ],
          [
            "frames_dropped",
            <>
              The number of times <C>frame(None)</C> was called.
            </>,
            "At least one frame was dropped.",
          ],
          [
            "action_delay_ms",
            "The value your code gave. The SDK cannot measure it: it does not know when the robot acted.",
            "Your code called action_delay.",
          ],
          [
            "control_hz",
            "The value your code gave when it started the episode.",
            "It was given.",
          ],
        ]}
      />
      <P>
        A report also carries the number of control steps, the duration of the attempt in
        seconds, and its start time.
      </P>
      <UL>
        <LI>
          <Strong>The median inference time hides spikes.</Strong> An attempt in which one
          call in twenty takes a second has the same median as one without.
        </LI>
        <LI>
          <Strong>Brightness is one number per attempt</Strong>, over all channels and the
          whole image. It says nothing about where the image is dark, about color, or about
          contrast. With several cameras, record the frames of the camera the policy depends
          on most, or the numbers are mixed.
        </LI>
        <LI>
          <Strong>Dropped frames are counted only if you report them.</Strong> The SDK does
          not watch the camera. Your loop has to know that a frame was due.
        </LI>
        <LI>
          <Strong>Inference time is not action delay.</Strong> The delay between choosing an
          action and the robot acting on it also contains transport and the controller. When
          no delay is reported, the suggestion rule falls back to the inference time, which
          is a lower bound.
        </LI>
      </UL>

      <H2 id="never-raises">Reporting never stops a robot</H2>
      <P>
        <C>finish</C>, <C>report</C>, <C>flush</C> and <C>close</C> do not raise when the
        server cannot be reached. A report that could not be sent is kept in memory and sent
        with the next one.
      </P>
      <DocTable
        caption="What happens to a report that is not accepted"
        head={["Outcome", "What the SDK does"]}
        monoFirst={false}
        rows={[
          ["The server cannot be reached, or does not answer within 10 seconds", "Keeps the report and retries with the next report. Logs a warning."],
          ["Status 500 or above, or 429", "The same."],
          [
            "Any other status of 400 or above",
            "Drops the batch and logs an error. The server will never accept it, and keeping it would block every later report.",
          ],
        ]}
      />
      <UL>
        <LI>
          Reports wait <Strong>in memory</Strong>. They are lost when the process ends. Call{" "}
          <C>close()</C> before exit, and check <C>pending</C> if it matters.
        </LI>
        <LI>
          At most 5,000 reports wait. Beyond that the oldest are discarded. The limit is the{" "}
          <C>max_pending</C> argument of the client.
        </LI>
        <LI>Reports are sent in batches of up to 500.</LI>
        <LI>
          A rejected batch is dropped whole. One report that names a release the project
          does not have takes the rest of its batch with it.
        </LI>
        <LI>
          Sending happens in the thread that calls <C>finish</C>, and can take up to the
          timeout. Call <C>finish</C> after the attempt, not inside the control loop.
        </LI>
      </UL>

      <H2 id="idempotency">Sending a report twice</H2>
      <P>
        Every episode has an id, 32 hexadecimal characters chosen when the episode starts.
        The server stores one report per id within a project. A report that is sent again,
        after a timeout whose answer was lost for example, replaces itself and is not counted
        twice.
      </P>
      <P>
        If you build reports yourself, choose the id once per attempt and reuse it for every
        retry. An id of your own, such as a robot name with a counter, works as long as it is
        unique within the project and at most 120 characters.
      </P>

      <H2 id="by-hand">Reporting by hand</H2>
      <P>
        For a robot whose loop you cannot change, report an attempt from the command line.
        Only the outcome and what you type are reported. Nothing is measured.
      </P>
      <CodeBlock lang="shell" code={report} />
      <P>
        Each call is a new report with a new id. Unlike the SDK, the command exits with code
        2 when the server could not be reached. A report that the server rejects, for example
        one that names a release the project does not have, is dropped as described above,
        and the command still prints <C>reported</C>. Check the Field page after the first
        report.
      </P>

      <H2 id="suggestions">From field conditions to tests</H2>
      <P>
        After every batch of reports, the server compares what robots measured with what the
        suite covers, and records a proposal when the field is outside that range. A proposal
        is a complete scenario file with the measurement it came from.
      </P>
      <Callout title="Rules, not a model">
        <p>
          The proposals come from three fixed rules over the reported measurements. Nothing
          is learned, and nothing looks at images or actions. A rule can only propose what
          it was written to look for.
        </p>
      </Callout>
      <UL>
        <LI>
          <Strong>What the suite covers</Strong> is read from the perturbations of the
          project’s latest completed run: the largest <C>action_latency</C> steps, the
          largest <C>frame_drop</C> probability, and the range of the brightness multipliers
          of <C>image_adjust</C> and the intensity multipliers of <C>lighting</C>. A suite
          without those perturbations covers a delay of 0, a drop rate of 0 and a brightness
          of exactly 1. Without a completed run, nothing is proposed.
        </LI>
        <LI>
          <Strong>What the field shows</Strong> is read from the latest 2,000 reports of the
          project.
        </LI>
        <LI>
          Each rule needs <Strong>at least 10 reports</Strong> that carry its measurement.
          This is the constant <C>MIN_REPORTS</C> in{" "}
          <C>apps/web/src/lib/pipeline/suggest.ts</C>.
        </LI>
        <LI>Reports marked as simulated are used like any others.</LI>
      </UL>
      <CodeBlock lang="yaml" filename="Example of a proposed scenario" code={suggestion} />

      <H3 id="rule-delay">Action delay</H3>
      <DocTable
        caption="The action delay rule"
        head={["Step", "Rule"]}
        monoFirst={false}
        rows={[
          ["Measurement", "action_delay_ms of each report, or inference_ms when no delay was reported."],
          ["Needs", "At least 10 reports with either."],
          [
            "Conversion",
            "Milliseconds to control steps at the median reported control_hz, or at 50 Hz when none was reported. Rounded, and at least 1.",
          ],
          [
            "Proposes when",
            "The 90th percentile of the delay, in steps, is greater than the largest action_latency the suite tests.",
          ],
          ["Proposal", "A sweep of action_latency over the median and the 90th percentile."],
        ]}
      />

      <H3 id="rule-frames">Dropped frames</H3>
      <DocTable
        caption="The dropped frames rule"
        head={["Step", "Rule"]}
        monoFirst={false}
        rows={[
          ["Measurement", "frames_dropped divided by the number of steps, per report."],
          ["Needs", "At least 10 reports with frames_dropped and more than 0 steps."],
          [
            "Proposes when",
            "The 90th percentile of that rate is above 1% and above the largest frame_drop probability the suite tests.",
          ],
          ["Proposal", "frame_drop with that rate as its probability, rounded to two decimals."],
        ]}
      />
      <P>
        An attempt with no dropped frame reports no <C>frames_dropped</C>, so it is not among
        the reports this rule looks at. The percentile is taken over attempts that dropped at
        least one frame, and overstates the rate of the fleet as a whole.
      </P>

      <H3 id="rule-brightness">Image brightness</H3>
      <DocTable
        caption="The image brightness rule"
        head={["Step", "Rule"]}
        monoFirst={false}
        rows={[
          ["Measurement", "image_brightness, separately for failed and for successful attempts."],
          ["Needs", "At least 10 failed and at least 10 successful reports with it."],
          ["Ratio", "The median brightness of failed attempts divided by that of successful ones."],
          [
            "Proposes when",
            "The ratio differs from 1 by more than 15%, and lies more than 0.05 outside the range of brightness the suite tests.",
          ],
          ["Proposal", "image_adjust with the ratio as its brightness, rounded to two decimals."],
        ]}
      />
      <Callout kind="warning" title="An association, not a cause">
        <p>
          This rule reports that failed attempts had darker or brighter images than
          successful ones. It does not show that brightness made them fail. Dark images and
          failures can share a cause: the same robot, the same shift, the same corner of the
          building. The proposal says so in its rationale. Running the proposed test is what
          shows whether brightness alone makes the policy fail.
        </p>
      </Callout>
      <P>
        The other two rules make no claim about failures at all. They say that robots
        operate under a condition the suite does not test.
      </P>

      <H3 id="resolving">Accepting and dismissing</H3>
      <UL>
        <LI>
          A proposal is <C>open</C> until a member marks it as accepted or dismissed.
          Accepting records that you added the scenario. It does not add the file to your
          suite: copy the YAML into your repository.
        </LI>
        <LI>
          A proposal is made once. Each has a coarse identity, the rule and a rounded value,
          for example the delay rounded up to 5 steps. A dismissed proposal does not return
          because the measurement moved a little. It returns as a new proposal when the
          measurement moves to another rounded value.
        </LI>
        <LI>
          Proposed scenarios use 50 episodes and seed 1000 and carry the tag{" "}
          <C>from-field</C>. They have no assertions. Add the ones you need.
        </LI>
      </UL>

      <H2 id="flagged">Robots below the rest</H2>
      <P>
        The Field page lists success rates by release, by robot and by site, each with its
        95% Wilson interval and its number of interventions. A group is flagged as below the
        rest when all of these hold:
      </P>
      <UL>
        <LI>the group has at least 10 attempts, and so do all the others together,</LI>
        <LI>its success rate is lower than that of the others together,</LI>
        <LI>
          a one-sided Fisher exact test of the group against the others gives p below 0.05.
        </LI>
      </UL>
      <P>
        The flag is the label “below the rest”, with the p-value in its tooltip. It says that
        the difference is unlikely to be chance. It does not say why: the robot, its camera, its site and the release it
        runs are not separated. With many robots, expect an occasional flag that is chance:
        no correction is made for the number of groups.
      </P>

      <H2 id="simulate">A stand-in for hardware</H2>
      <P>
        <C>shakedown field simulate</C> lets you try the pipeline without a robot. It asks
        the server for the release on a channel, runs the policy in simulation as a number
        of stand-in robots, each under its own conditions, and reports every attempt through
        the SDK.
      </P>
      <CodeBlock lang="yaml" filename="robots.yaml" code={robots} />
      <CodeBlock lang="shell" code={simulate} />
      <P>The values below are illustrative.</P>
      <CodeBlock filename="Example output" code={simulateOut} />
      <UL>
        <LI>
          <Strong>Every report is marked as simulated</Strong>, and the Field page says how
          many of its reports come from a stand-in.
        </LI>
        <LI>
          The mark is shown, not enforced. The release gate, the suggestion rules and the
          flags treat simulated reports like real ones. Use a project of their own for them.
        </LI>
        <LI>
          <C>conditions</C> takes perturbations as a scenario does. A stand-in reports the
          delay of its <C>action_latency</C> exactly. A real robot has to measure it.
        </LI>
        <LI>
          The policy is the one you pass with <C>--policy</C>. The command does not check
          that it matches the spec of the release it reports against.
        </LI>
        <LI>
          A failed attempt is reported as an intervention with the reason “task not
          completed in time”. No person is involved.
        </LI>
        <LI>The channel needs a release. Promote one first.</LI>
      </UL>

      <H2 id="privacy">What is sent</H2>
      <P>
        A report contains the id, the policy label, the release number, the robot and site
        names you gave, the outcome, whether a person stepped in and why, your note, the
        number of steps, the duration, the start time, and the measurements above.
      </P>
      <P>
        No image, no observation and no action leaves the robot. Brightness is computed on
        the robot and sent as one number. The route and its limits are in the{" "}
        <A href="/docs/api#field-episodes">API reference</A>.
      </P>
    </DocPage>
  );
}
