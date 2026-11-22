import { CodeBlock } from "@/components/docs/code-block";
import { DocPage } from "@/components/docs/doc-page";
import { pageMetadata } from "@/components/docs/nav";
import { A, C, Callout, H2, H3, LI, P, Step, Steps, Strong, UL } from "@/components/docs/prose";
import { DocTable } from "@/components/docs/table";
import type { TocItem } from "@/components/docs/toc";

const href = "/docs/sim-to-real";

export const metadata = pageMetadata(href);

const toc: TocItem[] = [
  { id: "status", title: "Status" },
  { id: "why", title: "Why validate" },
  { id: "workflow", title: "The workflow" },
  { id: "record", title: "Recording trials" },
  { id: "prompts", title: "Answers at the prompt", level: 3 },
  { id: "resuming", title: "Stopping and resuming", level: 3 },
  { id: "log-format", title: "The trial log" },
  { id: "correlate", title: "Comparing with a simulated run" },
  { id: "matching", title: "How trials are matched", level: 3 },
  { id: "json", title: "JSON output", level: 3 },
  { id: "upload", title: "Uploading the trials", level: 3 },
  { id: "pearson", title: "Pearson correlation" },
  { id: "mmrv", title: "MMRV" },
  { id: "summary", title: "The summary line" },
  { id: "small-samples", title: "Small samples" },
];

const recordCmd = `shakedown real record scenarios/aloha-transfer-cube \\
  --policy-label v2 \\
  --trials 10 \\
  --robot aloha-01 \\
  --operator rk`;

const recordOut = `Recording to real-trials.jsonl. Answer y success, n failure, s skip the rest of this condition, q quit.

──────────────────────────────── camera-pan · pan=2 ────────────────────────────────
The top camera is rotated about its vertical axis, as after a knock to its mount.
Set up: camera_pose(pan_deg=2)
  trial 1/10 succeeded? [y/n/s/q]: y
  trial 2/10 succeeded? [y/n/s/q]: n
  what went wrong?: dropped during handover
  trial 3/10 succeeded? [y/n/s/q]:`;

const onlyCmd = `shakedown real record scenarios/aloha-transfer-cube \\
  --policy-label v2 \\
  --only nominal \\
  --only camera-pan@2 \\
  --only camera-pan@4`;

const logLines = `{"suite": "aloha-transfer-cube", "condition_key": "nominal", "policy_label": "v2", "trial": 0, "success": true, "robot": "aloha-01", "operator": "rk", "notes": "", "recorded_at": "2026-03-02T09:14:05+00:00"}
{"suite": "aloha-transfer-cube", "condition_key": "nominal", "policy_label": "v2", "trial": 1, "success": false, "robot": "aloha-01", "operator": "rk", "notes": "dropped during handover", "recorded_at": "2026-03-02T09:16:41+00:00"}`;

const correlateCmd = `shakedown real correlate runs/v2 real-trials.jsonl`;

const correlateOut = `v2: simulation against the real robot
┏━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━┓
┃ Condition                ┃  Simulated ┃       Real ┃ Real 95% interval ┃ Gap, pts ┃
┡━━━━━━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━┩
│ object-position · dy=6   │ 40% (n=50) │ 80% (n=10) │           49%–94% │    +40 * │
│ camera-pan · pan=4       │ 24% (n=50) │ 10% (n=10) │            2%–40% │      -14 │
│ lighting-dim · level=0.4 │ 52% (n=50) │ 40% (n=10) │           17%–69% │      -12 │
│ camera-pan · pan=2       │ 62% (n=50) │ 70% (n=10) │           40%–89% │       +8 │
│ lighting-dim · level=0.7 │ 84% (n=50) │ 80% (n=10) │           49%–94% │       -4 │
│ nominal                  │ 90% (n=50) │ 90% (n=10) │           60%–98% │       +0 │
└──────────────────────────┴────────────┴────────────┴───────────────────┴──────────┘
Pearson r 0.76   mean max rank violation 0.15
* the simulated rate is outside the real 95% interval
Simulation tracks reality loosely; use it for ranking, not for absolute rates.`;

const jsonOut = `{
  "policy_label": "v2",
  "pearson": 0.764556574473706,
  "mmrv": 0.15000000000000002,
  "summary": "simulation tracks reality loosely; use it for ranking, not for absolute rates",
  "pairs": [
    {
      "key": "nominal",
      "label": "nominal",
      "sim_rate": 0.9,
      "sim_n": 50,
      "real_rate": 0.9,
      "real_n": 10,
      "real_low": 0.5958499732118333,
      "real_high": 0.9821237869044116,
      "sim_outside_real_interval": false
    }
  ]
}`;

const robotCmd = `shakedown real correlate runs/v2 real-trials.jsonl --robot aloha-01`;

const uploadCmd = `export SHAKEDOWN_URL="https://shakedown.example.com"
export SHAKEDOWN_API_KEY="shk_..."

shakedown real correlate runs/v2 real-trials.jsonl --upload`;

const mmrv = `for each condition i:
    violation[i] = max over j of |real[i] − real[j]|
                   for the conditions j that the simulator ranks
                   in the opposite order to reality

MMRV = mean over i of violation[i]        # 0 when no pair is misordered`;

export default function SimToRealPage() {
  return (
    <DocPage
      href={href}
      toc={toc}
      lead="A simulated result is useful only to the extent that it predicts what the real robot does. Sim-to-real validation measures that: you run trials on the real robot, record the outcomes, and Shakedown compares them with a simulated run of the same policy."
    >
      <H2 id="status">Status</H2>
      <Callout kind="warning" title="Not yet tested on physical hardware">
        <p>
          The real-robot workflow has been tested with synthetic trial logs only. The
          commands on this page record what an operator types and do arithmetic on the
          result, so there is little that depends on the robot. But nobody has yet taken the
          workflow through a session on a physical robot, and the wording of the prompts and
          the ergonomics of recording may change once that has happened.
        </p>
      </Callout>

      <H2 id="why">Why validate</H2>
      <P>
        A simulator is a model of the workcell. Its rendering, contact physics and actuator
        dynamics all differ from the real system. A policy can pass a condition in simulation
        and fail it on the robot, or the reverse. Until you have checked, you do not know how
        far to trust a simulated verdict.
      </P>
      <P>
        The check does not require simulated and real success rates to be equal. For
        regression testing, the question is narrower: when the simulator says that condition A
        is harder than condition B, is that also true on the real robot?
      </P>

      <H2 id="workflow">The workflow</H2>
      <Steps>
        <Step n={1} title="Run the suite in simulation">
          Use <C>shakedown run</C> as usual, and note the policy label. The label is what ties
          the real trials to the simulated run.
        </Step>
        <Step n={2} title="Run trials on the real robot">
          <C>shakedown real record</C> walks through the conditions of the suite. For each
          trial you set up the condition on the real workcell, run the policy with your own
          tooling, and type whether it succeeded.
        </Step>
        <Step n={3} title="Compare">
          <C>shakedown real correlate</C> pairs each simulated condition with its real
          trials, and reports the Pearson correlation and the mean maximum rank violation.
        </Step>
      </Steps>
      <Callout title="Shakedown does not drive the robot">
        <p>
          No command on this page connects to a robot, sends an action or reads a sensor.
          Shakedown shows which condition to set up and records the answer. Running the
          policy, judging success and keeping the workcell safe are the operator’s job, with
          the team’s usual tooling.
        </p>
      </Callout>

      <H2 id="record">Recording trials</H2>
      <P>
        Pass the same suite that was run in simulation and the label of the policy. The
        command is interactive and needs a terminal.
      </P>
      <CodeBlock lang="shell" code={recordCmd} />
      <P>
        For each condition it prints the label, the description from the scenario file, and
        the perturbations to set up, then asks for the outcome of each trial. The session
        below is illustrative.
      </P>
      <CodeBlock filename="Example session" code={recordOut} />
      <UL>
        <LI>
          <Strong>Setting up the condition is manual.</Strong> The line <C>Set up:</C> lists
          the perturbations with the parameters that differ from their defaults. Reproduce
          them on the real workcell as closely as you can: rotate the camera 2 degrees, dim
          the lights, move the object. For an unperturbed condition it reads “the nominal
          scene, unchanged”.
        </LI>
        <LI>
          <Strong>Some conditions cannot be reproduced.</Strong> Image noise, action latency
          or a scaled actuator gain have no simple physical counterpart. Leave them out with{" "}
          <C>--only</C>, or skip them at the prompt.
        </LI>
        <LI>
          <Strong>Decide what success means before you start.</Strong> Use the criterion of
          the simulated task, and apply it the same way in every trial.
        </LI>
      </UL>
      <P>
        <C>--only</C> restricts the session to the condition keys you name. It can be
        repeated. A key of a swept condition has the form <C>name@value</C>.
      </P>
      <CodeBlock lang="shell" code={onlyCmd} />

      <H3 id="prompts">Answers at the prompt</H3>
      <DocTable
        caption="Answers at the prompt of shakedown real record"
        head={["Answer", "Effect"]}
        rows={[
          ["y", "Record a success."],
          [
            "n",
            "Record a failure, then ask what went wrong. The note is free text and may be left empty.",
          ],
          ["s", "Skip the remaining trials of this condition and go to the next one."],
          ["q", "Stop the session. Trials recorded so far are already saved."],
        ]}
      />
      <P>Any other answer is asked again. Answers are not case-sensitive.</P>

      <H3 id="resuming">Stopping and resuming</H3>
      <P>
        Every answer is appended to the log at once, so nothing is lost when a session is
        interrupted. Run the same command again to resume. For each condition the command
        counts the trials already in the log for that suite, condition and policy label,
        continues from the next trial number, and skips a condition that already has the
        requested number of trials.
      </P>
      <P>
        There is no command to correct an answer. To fix a mistake, edit or delete the line
        in the log.
      </P>

      <H2 id="log-format">The trial log</H2>
      <P>
        The log is a JSON Lines file: one JSON object per line, one line per trial. The
        default name is <C>real-trials.jsonl</C>. It is a plain text file that you can keep
        in version control, append to across sessions, and merge by concatenating files.
      </P>
      <CodeBlock lang="json" filename="real-trials.jsonl" code={logLines} />
      <DocTable
        caption="Fields of a trial record"
        head={["Field", "Type", "Meaning"]}
        rows={[
          [
            "suite",
            "string",
            "Name of the suite: the directory name, or the file name without its extension.",
          ],
          ["condition_key", "string", "Key of the condition, as in the simulated result."],
          ["policy_label", "string", "Label of the policy that was run."],
          ["trial", "integer", "Index of the trial within its condition, starting at 0."],
          ["success", "boolean", "Whether the trial succeeded."],
          ["robot", "string", "Value of --robot. Empty when not given."],
          ["operator", "string", "Value of --operator. Empty when not given."],
          ["notes", "string", "What went wrong, for a failed trial. Empty otherwise."],
          [
            "recorded_at",
            "string",
            "Time the answer was given, in UTC, as an ISO 8601 timestamp with seconds.",
          ],
        ]}
      />
      <P>
        The first five fields are required in every line. A line that is not valid JSON, or
        that has a missing or unknown field, stops the command that reads the log with an
        error naming the file and the line number. Blank lines are ignored.
      </P>
      <P>
        Because the format is this simple, trials recorded by other means, such as an
        existing evaluation script, can be written to the same file.
      </P>

      <H2 id="correlate">Comparing with a simulated run</H2>
      <P>
        Pass the simulated run, as a run directory or a <C>result.json</C> file, and the trial
        log. The log defaults to <C>real-trials.jsonl</C> in the current directory.
      </P>
      <CodeBlock lang="shell" code={correlateCmd} />
      <P>The values below are illustrative, with 10 real trials per condition.</P>
      <CodeBlock filename="Example output" code={correlateOut} />
      <DocTable
        caption="Columns of the comparison"
        head={["Column", "Meaning"]}
        monoFirst={false}
        rows={[
          ["Simulated", "Success rate in the simulated run, and its number of episodes."],
          ["Real", "Success rate on the real robot, and its number of trials."],
          ["Real 95% interval", "Wilson score interval for the real success rate."],
          [
            "Gap, pts",
            "Real rate minus simulated rate, in percentage points. Negative when the simulator is optimistic.",
          ],
        ]}
      />
      <UL>
        <LI>Rows are sorted by the size of the gap, largest first.</LI>
        <LI>
          An asterisk after the gap marks a condition whose simulated rate lies outside the
          real 95% interval. A footnote under the table explains the mark when it occurs. In
          the example that is one condition, with a gap of 40 points. The gaps of 14 and 12
          points are not marked: with 10 trials the intervals are wide enough to contain
          them.
        </LI>
        <LI>
          A value that cannot be computed is shown as <C>–</C>.
        </LI>
      </UL>
      <P>
        The command exits with code 0 whatever the correlation. It reports and does not gate.
        It exits with code 2 when the run or the log cannot be read, when the log is empty,
        and when the log holds several robots and none was chosen.
      </P>

      <H3 id="matching">How trials are matched</H3>
      <UL>
        <LI>
          Only trials whose <C>policy_label</C> and <C>suite</C> both equal those of the
          simulated run are used. When none match, the command lists the policy labels the
          log does contain.
        </LI>
        <LI>
          A condition is compared when it appears in the run and has at least one trial.
          Conditions measured on one side only are left out.
        </LI>
        <LI>
          Within those, trials are matched to conditions by condition key. One log can
          therefore hold trials for several suites and several policy versions.
        </LI>
        <LI>
          Trials from different robots are never pooled silently. When the log holds trials
          from more than one robot, the command stops with an error that names them, and you
          choose one with <C>--robot</C>. Trials recorded without <C>--robot</C> count as one
          robot, shown as <C>unnamed</C>.
        </LI>
      </UL>
      <CodeBlock lang="shell" code={robotCmd} />
      <P>
        The check counts the robots in the whole log, including trials of other suites and
        policy labels. A log that mixes robots always needs <C>--robot</C>.
      </P>

      <H3 id="json">JSON output</H3>
      <P>
        <C>--json</C> prints the comparison as JSON in place of the table, for scripts and
        notebooks. The example is shortened to one pair.
      </P>
      <CodeBlock lang="json" filename="Example output, shortened" code={jsonOut} />
      <P>
        <C>pearson</C> and <C>mmrv</C> are <C>null</C> when they cannot be computed.{" "}
        <C>sim_outside_real_interval</C> is the condition the asterisk marks in the table.
      </P>

      <H3 id="upload">Uploading the trials</H3>
      <P>
        <C>--upload</C> sends the trials that were used, those of the run’s policy label and
        suite and of the chosen robot, to the Shakedown server, after printing the
        comparison. The dashboard then shows simulated and real
        rates side by side. The host below is a placeholder.
      </P>
      <CodeBlock lang="shell" code={uploadCmd} />
      <UL>
        <LI>
          The server URL and the API key are read as for <C>shakedown run --upload</C>. See{" "}
          <A href="/docs/dashboard#configure">Dashboard</A>.
        </LI>
        <LI>
          Uploaded per trial: suite, policy label, robot, condition key, trial number,
          outcome, operator, note and time.
        </LI>
        <LI>
          The server identifies a trial by suite, condition key, policy label, robot and
          trial number. Uploading the same log again replaces the trials and does not
          duplicate them. Trials from different robots are stored separately.
        </LI>
      </UL>

      <H2 id="pearson">Pearson correlation</H2>
      <P>
        The Pearson correlation coefficient <C>r</C> measures the linear relationship between
        the simulated and the real success rates across conditions. It ranges from −1 to 1. A
        value near 1 means that conditions with a higher simulated success rate also have a
        higher real one, in proportion.
      </P>
      <UL>
        <LI>
          It is insensitive to offset and scale. A simulator that is 20 points too optimistic
          on every condition still correlates perfectly. Read the gap column for that.
        </LI>
        <LI>
          It is undefined when either side has no variance, for example when the policy
          succeeds in every simulated condition, and with fewer than two conditions.
        </LI>
      </UL>

      <H2 id="mmrv">MMRV</H2>
      <P>
        MMRV is the mean maximum rank violation, introduced by the SIMPLER evaluation work. It
        looks at pairs of conditions that the simulator ranks in the opposite order to reality.
        For such a pair, the violation is the size of the gap between the two real success
        rates. Each condition contributes its worst violation, and the metric is the mean of
        those.
      </P>
      <CodeBlock filename="Mean maximum rank violation" code={mmrv} />
      <UL>
        <LI>
          0 means the simulator never misorders two conditions. Larger values are worse. The
          value is on the scale of a success rate, so 0.10 is 10 percentage points.
        </LI>
        <LI>
          Misordering two conditions that are nearly equal in reality costs little.
          Misordering two that are far apart costs a lot. That matches what matters for
          regression testing.
        </LI>
      </UL>
      <P>
        In the example, the simulator ranks <C>object-position · dy=6</C> (40%) below{" "}
        <C>lighting-dim · level=0.4</C> (52%) and below <C>camera-pan · pan=2</C> (62%). On
        the robot it is above both (80% against 40% and 70%). The worst violation of{" "}
        <C>object-position</C> and of <C>lighting-dim · level=0.4</C> is the gap between
        them, 0.40. That of <C>camera-pan · pan=2</C> is 0.10. The other three conditions
        have none. The mean over six conditions is 0.90 / 6 = 0.15.
      </P>
      <P>
        Both metrics are implemented in <C>engine/src/shakedown/stats.py</C>, as{" "}
        <C>pearson</C> and <C>mmrv</C>.
      </P>

      <H2 id="summary">The summary line</H2>
      <P>
        The last line of the output is a one-sentence reading of the result. The rules are
        tried in this order, and the first that applies decides:
      </P>
      <DocTable
        caption="How the summary is chosen, in order"
        head={["Rule", "Applies when", "Summary"]}
        numeric={[0]}
        monoFirst={false}
        rows={[
          [
            "1",
            "No condition was measured both ways",
            "no condition was measured both in simulation and on the robot",
          ],
          [
            "2",
            "Fewer than 4 conditions were measured both ways, or r cannot be computed",
            "only N condition(s) measured both ways; at least 4 are needed to judge",
          ],
          [
            "3",
            "Any compared condition has fewer than 5 real trials",
            "N condition(s) have fewer than 5 real trials; record more before judging",
          ],
          [
            "4",
            "r is 0.8 or higher and MMRV is 0.1 or lower",
            "simulation tracks reality well for this scene",
          ],
          [
            "5",
            "r is 0.8 or higher",
            "simulation tracks reality overall but misorders some conditions; use it with care for ranking",
          ],
          [
            "6",
            "r is 0.5 or higher",
            "simulation tracks reality loosely; use it for ranking, not for absolute rates",
          ],
          ["7", "Otherwise", "simulation does not predict reality for this scene"],
        ]}
      />
      <UL>
        <LI>
          The constants are <C>MIN_CONDITIONS = 4</C> and <C>MIN_TRIALS = 5</C> in{" "}
          <C>engine/src/shakedown/real/correlate.py</C>. The thresholds 0.8 and 0.5 for r and
          0.1 for MMRV are fixed in the same file. They are conventions for a first reading,
          not results of a study.
        </LI>
        <LI>
          The example has r = 0.76, so rule 6 applies. Its MMRV of 0.15 would also have kept
          it from rule 4.
        </LI>
        <LI>
          Five trials is a floor, not a recommendation. A rate measured with 5 trials has a
          95% interval more than 40 points wide, whatever the rate. The summary does not look at the intervals.
          Read them.
        </LI>
      </UL>

      <H2 id="small-samples">Small samples</H2>
      <P>
        Real trials are expensive. Ten trials per condition is a common budget, and it is
        small. The interval of a real success rate is then wide, whatever the rate:
      </P>
      <DocTable
        caption="95% Wilson interval of a real success rate measured with 10 trials"
        head={["Successes of 10", "Rate", "95% interval"]}
        numeric={[0, 1, 2]}
        monoFirst={false}
        rows={[
          ["9", "90%", "60% to 98%"],
          ["7", "70%", "40% to 89%"],
          ["5", "50%", "24% to 76%"],
          ["1", "10%", "2% to 40%"],
        ]}
      />
      <UL>
        <LI>
          <Strong>One trial moves the rate by 10 points.</Strong> A gap of 10 or 15 points
          between simulation and reality is within what 10 trials produce by chance.
        </LI>
        <LI>
          <Strong>The metrics inherit the noise.</Strong> Pearson r and MMRV are computed from
          the observed rates as if they were exact. With few trials and few conditions, both
          can change substantially when one trial flips.
        </LI>
        <LI>
          <Strong>Spread the conditions.</Strong> A correlation is informative only when the
          conditions differ in difficulty. Include conditions that the policy passes easily
          and conditions it clearly fails. Six conditions that all sit near 80% give an
          unstable r whatever the simulator’s quality.
        </LI>
        <LI>
          <Strong>More conditions help more than more trials on few conditions</Strong>, once
          each condition has enough trials to separate easy from hard.
        </LI>
        <LI>
          <Strong>A good score covers the conditions you tested.</Strong> It says nothing
          about perturbations, objects or tasks that were not part of the comparison.
        </LI>
        <LI>
          <Strong>Validation expires.</Strong> Repeat it when the workcell, the robot, the
          cameras or the simulated scene change.
        </LI>
      </UL>
      <Callout title="Validation does not make the simulator correct">
        <p>
          It tells you how well simulated results have tracked real ones so far, on the
          conditions you measured, within the uncertainty of the trials you ran. See{" "}
          <A href="/docs/limitations">Limitations</A>.
        </p>
      </Callout>
    </DocPage>
  );
}
