import type { ReactNode } from "react";

import { CodeBlock } from "@/components/docs/code-block";
import { DocPage } from "@/components/docs/doc-page";
import { pageMetadata } from "@/components/docs/nav";
import { A, C, Callout, H2, LI, P, UL } from "@/components/docs/prose";
import { DocTable } from "@/components/docs/table";
import type { TocItem } from "@/components/docs/toc";

const href = "/docs/cli";

export const metadata = pageMetadata(href);

const toc: TocItem[] = [
  { id: "usage", title: "Usage" },
  { id: "init", title: "shakedown init" },
  { id: "validate", title: "shakedown validate" },
  { id: "list", title: "shakedown list" },
  { id: "run", title: "shakedown run" },
  { id: "report", title: "shakedown report" },
  { id: "compare", title: "shakedown compare" },
  { id: "upload", title: "shakedown upload" },
  { id: "serve-policy", title: "shakedown serve-policy" },
  { id: "tune", title: "shakedown tune" },
  { id: "recommend", title: "shakedown recommend" },
  { id: "release", title: "shakedown release" },
  { id: "field-report", title: "shakedown field report" },
  { id: "field-simulate", title: "shakedown field simulate" },
  { id: "real-record", title: "shakedown real record" },
  { id: "real-correlate", title: "shakedown real correlate" },
  { id: "scan-import", title: "shakedown scan import" },
  { id: "environment", title: "Environment variables" },
];

type Row = ReactNode[];

function Options({ command, rows }: { command: string; rows: Row[] }) {
  return (
    <DocTable
      caption={`Options of ${command}`}
      head={["Option", "Value", "Default", "Meaning"]}
      rows={[...rows, ["--help", "", "", "Show the help text and exit."]]}
    />
  );
}

function Arguments({ command, rows }: { command: string; rows: Row[] }) {
  return (
    <DocTable
      caption={`Arguments of ${command}`}
      head={["Argument", "Value", "Default", "Meaning"]}
      rows={rows}
    />
  );
}

const validateBad = `┏━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━━━━┳━━━━━━━━━━━━━━━┓
┃ Scenario ┃ Environment         ┃ Conditions ┃ Episodes ┃ Perturbations ┃
┡━━━━━━━━━━╇━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━━━━━╇━━━━━━━━━━━━━━━┩
│ nominal  │ aloha/transfer_cube │          1 │        5 │ none          │
└──────────┴─────────────────────┴────────────┴──────────┴───────────────┘
invalid: scenarios/bad-camera.yaml: bad-camera: no camera named 'overhead' in this scene. Available:
left_pillar, right_pillar, top, angle, front_close, left_wrist, right_wrist`;

const compareOut = `v1  →  v2
┏━━━━━━━━━━━━━━━━━━━━┳━━━━━━┳━━━━━━┳━━━━━━━┳━━━━━━━┳━━━━━━━┳━━━━━━━┳━━━━━━━━┓
┃ Condition          ┃ Base ┃ Head ┃ Δ pts ┃ Broke ┃ Fixed ┃     p ┃ Result ┃
┡━━━━━━━━━━━━━━━━━━━━╇━━━━━━╇━━━━━━╇━━━━━━━╇━━━━━━━╇━━━━━━━╇━━━━━━━╇━━━━━━━━┩
│ camera-pan · pan=4 │  24% │   6% │   -18 │     9 │     0 │ 0.004 │ FAIL   │
│ nominal            │  90% │  92% │    +2 │     0 │     1 │ 1.000 │ PASS   │
│ camera-pan · pan=1 │  86% │  88% │    +2 │     0 │     1 │ 1.000 │ PASS   │
│ camera-pan · pan=2 │  54% │  62% │    +8 │     0 │     4 │ 0.125 │ PASS   │
└────────────────────┴──────┴──────┴───────┴───────┴───────┴───────┴────────┘`;

export default function CliPage() {
  return (
    <DocPage
      href={href}
      toc={toc}
      lead="Every command of the shakedown command line tool, with its arguments, options and defaults. The tables follow the --help output of engine version 0.1.0."
    >
      <H2 id="usage">Usage</H2>
      <CodeBlock lang="shell" code="shakedown [OPTIONS] COMMAND [ARGS]..." />
      <DocTable
        caption="Commands"
        head={["Command", "Purpose"]}
        rows={[
          ["init", "Write a starter scenario suite."],
          ["validate", "Check scenario files without running anything."],
          ["list", "List the available environments and perturbations."],
          ["run", "Run a scenario suite against a policy."],
          ["report", "Print a saved result in another format."],
          ["compare", "Compare two saved results condition by condition."],
          ["upload", "Upload a finished run to the Shakedown server."],
          [
            "serve-policy",
            "Serve a policy over HTTP, so it can be tested without sharing its weights.",
          ],
          ["release", "Print the release that robots on a channel should run."],
          ["recommend", "Choose between runtime settings that were each run on the same suite."],
          ["tune", "Run a suite under several runtime settings and choose one."],
          [
            "field",
            "Report what happens on real robots. A group of two commands: report and simulate.",
          ],
          [
            "real",
            "Validate simulated results against a real robot. A group of two commands: record and correlate.",
          ],
          [
            "scan",
            "Turn a scan of a real workcell into a test scene. A group of one command: import.",
          ],
        ]}
      />
      <DocTable
        caption="Global options"
        head={["Option", "Meaning"]}
        rows={[
          ["--version", "Show the version and exit."],
          ["--help", "Show the help text and exit. Every command accepts it."],
        ]}
      />
      <P>
        Running <C>shakedown</C> with no command prints the help text. Errors are printed to
        standard error, prefixed with <C>error:</C>, and the command exits with code 2.
      </P>

      <H2 id="init">shakedown init</H2>
      <P>Writes a starter scenario suite of two files.</P>
      <CodeBlock lang="shell" code="shakedown init [DIRECTORY]" />
      <Arguments
        command="shakedown init"
        rows={[["DIRECTORY", "path", "scenarios", "Where to write the starter suite."]]}
      />
      <Options command="shakedown init" rows={[]} />
      <P>
        The directory is created when it does not exist. The files are <C>nominal.yaml</C> and{" "}
        <C>camera-pan.yaml</C>. A file that already exists is skipped and reported, not
        overwritten.
      </P>

      <H2 id="validate">shakedown validate</H2>
      <P>
        Checks scenario files without running any episodes. It parses each file, expands
        sweeps, builds every perturbation with its parameters, and checks that the environment
        exists and supports each sim perturbation. Then it builds the scene of every condition
        and resets it once.
      </P>
      <CodeBlock lang="shell" code="shakedown validate [OPTIONS] SUITE" />
      <Arguments
        command="shakedown validate"
        rows={[["SUITE", "path", "required", "A scenario file or a directory of them."]]}
      />
      <Options
        command="shakedown validate"
        rows={[
          [
            "--build / --no-build",
            "flag",
            "--build",
            "Build each condition’s scene to check that it loads. --no-build checks the files only.",
          ],
        ]}
      />
      <P>Building the scenes finds what the files alone cannot show:</P>
      <UL>
        <LI>a sim perturbation naming a camera that the scene does not have,</LI>
        <LI>
          an observation perturbation naming a camera that the policy is not given,
        </LI>
        <LI>
          a <C>scanned_scene</C> whose path is not an imported scene,
        </LI>
        <LI>distractors that cannot be placed without overlap,</LI>
        <LI>
          a parameter that one environment rejects, such as{" "}
          <C>object_appearance.size_scale</C> in <C>pusht</C>.
        </LI>
      </UL>
      <CodeBlock filename="Example output, one problem" code={validateBad} />
      <P>
        Prints a table with one row per valid scenario, then one line per problem, prefixed
        with <C>invalid:</C> and naming the file and the condition. Exit codes: 0 when every
        file is valid, 1 when a problem was found in a condition, 2 when a file cannot be
        parsed or fails the schema.
      </P>
      <P>
        An environment counts as unknown when its simulator is not installed. Building scenes
        needs the simulators and the same rendering support as a run, and takes longer than
        reading the files. Use <C>--no-build</C> on a machine without them, for example in a
        lint step.
      </P>

      <H2 id="list">shakedown list</H2>
      <P>
        Lists the environments whose simulator is installed, with their backend and supported
        sim perturbations, and every perturbation with its kind, parameters, defaults and a
        one-line summary.
      </P>
      <CodeBlock lang="shell" code="shakedown list" />
      <Options command="shakedown list" rows={[]} />

      <H2 id="run">shakedown run</H2>
      <P>Runs a scenario suite against a policy.</P>
      <CodeBlock lang="shell" code="shakedown run [OPTIONS] SUITE" />
      <Arguments
        command="shakedown run"
        rows={[["SUITE", "path", "required", "A scenario file or a directory of them."]]}
      />
      <Options
        command="shakedown run"
        rows={[
          [
            "--policy, -p",
            "text",
            "required",
            <>
              <C>lerobot:&lt;checkpoint&gt;[?option=value]</C>, an http(s) URL, or{" "}
              <C>random</C>. See <A href="/docs/policies">Policies</A>.
            </>,
          ],
          [
            "--label, -l",
            "text",
            "from the policy",
            "Name for this policy version, for example v1.4 or a commit SHA. Defaults to the last component of the checkpoint path plus any options, or to http or random.",
          ],
          [
            "--baseline, -b",
            "path",
            "none",
            "A previous result file or run directory to compare with.",
          ],
          [
            "--out, -o",
            "path",
            "runs/<timestamp>-<label>",
            "Run directory.",
          ],
          [
            "--episodes, -n",
            "integer, 1 or more",
            "none",
            "Override every scenario’s episode count.",
          ],
          [
            "--videos",
            "failures, all or none",
            "failures",
            "Which episodes keep a replay video. failures keeps up to 8 failed episodes and 1 successful episode per condition.",
          ],
          [
            "--device",
            "text",
            "automatic",
            "cuda, mps or cpu. Without it: CUDA if available, then MPS, then CPU.",
          ],
          [
            "--workers, -w",
            "integer, 1 or more",
            "1",
            "Processes to spread conditions across. Each loads its own copy of the policy.",
          ],
          ["--upload", "flag", "off", "Send results to the Shakedown server."],
          [
            "--baseline-branch",
            "text",
            "none",
            "With --upload: compare with the latest completed run of this suite on this branch.",
          ],
          [
            "--url",
            "text",
            "SHAKEDOWN_URL",
            "Base URL of the Shakedown server. Read from the environment variable when not given.",
          ],
          [
            "--api-key",
            "text",
            "SHAKEDOWN_API_KEY",
            "Project API key. Read from the environment variable when not given.",
          ],
          [
            "--policy-token",
            "text",
            "SHAKEDOWN_POLICY_TOKEN",
            "Bearer token for a served policy. Read from the environment variable when not given.",
          ],
          [
            "--fail-on",
            "fail or warn",
            "fail",
            "Exit non-zero on FAIL only, or on WARN as well.",
          ],
          ["--junit", "path", "none", "Also write JUnit XML here."],
          ["--markdown", "path", "none", "Also write a Markdown summary here."],
          ["--no-progress", "flag", "off", "Hide progress bars."],
        ]}
      />
      <P>What the command does, in order:</P>
      <UL>
        <LI>
          Loads the scenario files and checks the whole suite as{" "}
          <C>shakedown validate</C> does, building the scene of every condition once. If
          anything is wrong, it lists every problem and exits with code 2. It also refuses{" "}
          <C>--workers</C> above 1 with a served policy.
        </LI>
        <LI>
          With <C>--upload</C>, checks the API key against the server and prints the project
          it belongs to.
        </LI>
        <LI>Loads the baseline, from the file or from the server.</LI>
        <LI>Loads the policy.</LI>
        <LI>
          Runs the conditions, unperturbed ones first. With <C>--upload</C>, each condition is
          sent to the server as it finishes. If a scene that passed the check still fails to
          build during the run, the condition is recorded as ERROR and the run continues.
        </LI>
        <LI>
          Writes <C>result.json</C>, prints the table, writes the report files and exits with
          the code that matches the verdict.
        </LI>
      </UL>
      <P>
        Exit codes are described in <A href="/docs/ci#exit-codes">Running in CI</A>. The layout
        of the run directory is described in the{" "}
        <A href="/docs/quickstart#run-directory">quickstart</A>.
      </P>
      <Callout title="An upload problem does not fail a finished run">
        <p>
          If sending one condition or marking the run complete fails, the CLI prints a warning
          and carries on. The local <C>result.json</C> is complete, and you can send it later
          with <C>shakedown upload</C>. Only a failure before the first episode, such as a
          rejected key, stops the command.
        </p>
      </Callout>

      <H2 id="report">shakedown report</H2>
      <P>Prints a saved result in another format. It does not run anything.</P>
      <CodeBlock lang="shell" code="shakedown report [OPTIONS] RESULT" />
      <Arguments
        command="shakedown report"
        rows={[["RESULT", "path", "required", "A result file or run directory."]]}
      />
      <Options
        command="shakedown report"
        rows={[
          [
            "--format, -f",
            "terminal, markdown, junit or json",
            "terminal",
            "Output format. Everything but terminal is written to standard output unstyled, so it can be redirected to a file.",
          ],
        ]}
      />
      <CodeBlock
        lang="shell"
        code={`shakedown report runs/v2 --format junit > reports/shakedown.xml`}
      />

      <H2 id="compare">shakedown compare</H2>
      <P>
        Compares two saved results condition by condition, applying one regression rule to
        every condition. It does not run anything and ignores the assertions in the scenario
        files.
      </P>
      <CodeBlock lang="shell" code="shakedown compare [OPTIONS] BASE HEAD" />
      <Arguments
        command="shakedown compare"
        rows={[
          ["BASE", "path", "required", "Baseline result file or run directory."],
          ["HEAD", "path", "required", "Candidate result file or run directory."],
        ]}
      />
      <Options
        command="shakedown compare"
        rows={[
          [
            "--max-drop",
            "number, 0 to 1",
            "0.05",
            "Largest acceptable drop in success rate.",
          ],
          [
            "--confidence",
            "0.8, 0.9, 0.95 or 0.99",
            "0.95",
            "A larger drop fails only when the p-value is below 1 − confidence. Any other value exits with code 2.",
          ],
          ["--fail-on", "fail or warn", "fail", "Exit non-zero on FAIL only, or on WARN as well."],
        ]}
      />
      <P>The values below are illustrative.</P>
      <CodeBlock filename="Example output" code={compareOut} />
      <UL>
        <LI>Rows are sorted by change in success rate, largest drop first.</LI>
        <LI>
          <C>Broke</C> is the number of seeds the baseline solved and the candidate did not.{" "}
          <C>Fixed</C> is the reverse. Both show <C>–</C> for an unpaired comparison, and the
          result is marked <C>(unpaired)</C>.
        </LI>
        <LI>
          A condition of the candidate that the baseline does not have is listed as{" "}
          <C>not in baseline</C> and does not affect the exit code.
        </LI>
        <LI>
          The exit code follows the most severe result, as for <C>shakedown run</C>.
        </LI>
      </UL>

      <H2 id="upload">shakedown upload</H2>
      <P>
        Uploads a finished run to the Shakedown server: the result, then the episode traces
        and videos of each condition. Use it for runs made without <C>--upload</C>, or on a
        machine without network access.
      </P>
      <CodeBlock lang="shell" code="shakedown upload [OPTIONS] RESULT" />
      <Arguments
        command="shakedown upload"
        rows={[
          [
            "RESULT",
            "path",
            "required",
            <>
              A run directory produced by <C>shakedown run</C>. A path to the{" "}
              <C>result.json</C> inside it is accepted too.
            </>,
          ],
        ]}
      />
      <Options
        command="shakedown upload"
        rows={[
          ["--url", "text", "SHAKEDOWN_URL", "Base URL of the Shakedown server."],
          ["--api-key", "text", "SHAKEDOWN_API_KEY", "Project API key."],
        ]}
      />
      <P>
        On success it prints the URL of the run, or its id when the server returns no URL.
        A run keeps its id. Uploading a run directory again, for example after an interrupted
        upload, reopens the same run on the server and replaces its conditions and files. It
        does not create a second run. The server answers 409 only when a run with that id
        belongs to another project.
      </P>

      <H2 id="serve-policy">shakedown serve-policy</H2>
      <P>
        Serves a policy over the <A href="/docs/policies#protocol">HTTP policy protocol</A>, so
        it can be tested without sharing its weights. Needs the <C>server</C> extra.
      </P>
      <CodeBlock lang="shell" code="shakedown serve-policy [OPTIONS]" />
      <Options
        command="shakedown serve-policy"
        rows={[
          [
            "--policy, -p",
            "text",
            "required",
            <>
              <C>lerobot:&lt;checkpoint&gt;</C> or <C>random</C>.
            </>,
          ],
          [
            "--action-dim",
            "integer",
            "from the checkpoint",
            "Action dimension reported by /info. Required for the random policy. Read from the checkpoint otherwise.",
          ],
          ["--host", "text", "127.0.0.1", "Interface to listen on."],
          ["--port", "integer", "8000", "Port to listen on."],
          ["--device", "text", "automatic", "cuda, mps or cpu."],
          [
            "--token",
            "text",
            "SHAKEDOWN_POLICY_TOKEN",
            "Require this bearer token on every route. Read from the environment variable when not given.",
          ],
        ]}
      />
      <P>
        The command runs until it is interrupted. It prints a warning when the host is not{" "}
        <C>127.0.0.1</C> or <C>localhost</C> and no token is set.
      </P>

      <H2 id="tune">shakedown tune</H2>
      <P>
        Runs a suite under several runtime settings and chooses one. The policy as given is
        always included, under the label <C>published</C>, as the setting to beat. See{" "}
        <A href="/docs/runtime-settings#tune">Runtime settings</A>.
      </P>
      <CodeBlock lang="shell" code="shakedown tune [OPTIONS] SUITE" />
      <Arguments
        command="shakedown tune"
        rows={[["SUITE", "path", "required", "A scenario file or a directory of them."]]}
      />
      <Options
        command="shakedown tune"
        rows={[
          [
            "--policy, -p",
            "text",
            "required",
            <>
              <C>lerobot:&lt;checkpoint&gt;</C>, with or without options.
            </>,
          ],
          [
            "--sweep, -s",
            "text",
            "required",
            <>
              A setting and the values to try, for example{" "}
              <C>n_action_steps=25,50,100</C>. Repeatable. Several sweeps are combined.
            </>,
          ],
          ["--out, -o", "path", "runs/tune", "Directory for the runs and the recommendation."],
          ["--episodes, -n", "integer, 1 or more", "none", "Override every scenario’s episode count."],
          ["--workers, -w", "integer, 1 or more", "1", "Processes for each run."],
          ["--device", "text", "automatic", "cuda, mps or cpu."],
        ]}
      />
      <P>
        Each setting is run with <C>shakedown run</C> in its own process, without videos,
        into a directory of <C>--out</C> named after its label. The choice is printed and
        written to <C>recommendation.json</C>. The command exits with code 2 when a setting
        cannot be run. It does not upload and takes no baseline.
      </P>

      <H2 id="recommend">shakedown recommend</H2>
      <P>
        Chooses between runtime settings that were each run on the same suite. It runs
        nothing. The rule is described in{" "}
        <A href="/docs/runtime-settings#recommend">Runtime settings</A>.
      </P>
      <CodeBlock lang="shell" code="shakedown recommend [OPTIONS] RUNS..." />
      <Arguments
        command="shakedown recommend"
        rows={[["RUNS", "paths", "required", "Two or more run directories or result files."]]}
      />
      <Options
        command="shakedown recommend"
        rows={[
          [
            "--default",
            "text",
            "none",
            "Label of the run made with the settings the policy was published with. It wins when several settings cannot be told apart.",
          ],
          ["--json", "flag", "off", "Print the recommendation as JSON."],
        ]}
      />
      <P>
        Exits with code 2 when a result cannot be read or fewer than two are given, and with
        0 otherwise. Runs are identified by their policy label, so the labels must differ.
      </P>

      <H2 id="release">shakedown release</H2>
      <P>
        Prints the release that robots on a channel should run. It changes nothing, on the
        server or on a robot. See <A href="/docs/releases#robot">Releases and gates</A>.
      </P>
      <CodeBlock lang="shell" code="shakedown release [OPTIONS]" />
      <Options
        command="shakedown release"
        rows={[
          ["--channel, -c", "fleet or canary", "fleet", "The channel to ask for."],
          ["--json", "flag", "off", "Print the release as JSON, or null."],
          ["--url", "text", "SHAKEDOWN_URL", "Base URL of the Shakedown server."],
          ["--api-key", "text", "SHAKEDOWN_API_KEY", "Project API key."],
        ]}
      />
      <P>
        Exit codes: 0 when the channel has a release, 1 when it has none, 2 when the server
        cannot be reached or refuses the request.
      </P>

      <H2 id="field-report">shakedown field report</H2>
      <P>
        Reports one attempt by hand, for robots whose loop you cannot change. See{" "}
        <A href="/docs/field#by-hand">Field reporting</A>.
      </P>
      <CodeBlock lang="shell" code="shakedown field report [OPTIONS]" />
      <Options
        command="shakedown field report"
        rows={[
          ["--policy-label, -l", "text", "required", "Label of the policy that ran."],
          ["--success / --failure", "flag", "required", "The outcome of the attempt."],
          ["--release", "integer", "none", "Release number."],
          ["--robot", "text", "empty", "Name of the robot."],
          ["--site", "text", "empty", "Where the robot is."],
          ["--intervention", "flag", "off", "A person stepped in."],
          ["--reason", "text", "empty", "Why a person stepped in."],
          ["--note", "text", "empty", "Free text."],
          ["--action-delay-ms", "number", "none", "The action delay you measured, in milliseconds."],
          ["--url", "text", "SHAKEDOWN_URL", "Base URL of the Shakedown server."],
          ["--api-key", "text", "SHAKEDOWN_API_KEY", "Project API key."],
        ]}
      />
      <P>
        Exits with code 2 when the server could not be reached. A report that the server
        rejects is dropped, and the command still prints <C>reported</C> and exits with code
        0.
      </P>

      <H2 id="field-simulate">shakedown field simulate</H2>
      <P>
        Stands in for a fleet: runs the policy in simulation as a number of robots and
        reports each attempt as a robot would. For trying the pipeline without hardware.
        Every report is marked as simulated. See{" "}
        <A href="/docs/field#simulate">Field reporting</A>.
      </P>
      <CodeBlock lang="shell" code="shakedown field simulate [OPTIONS]" />
      <Options
        command="shakedown field simulate"
        rows={[
          ["--policy, -p", "text", "required", "The policy the stand-in robots run."],
          ["--channel, -c", "text", "canary", "Release channel to report against."],
          ["--env", "text", "aloha/transfer_cube", "Environment to simulate in."],
          [
            "--robots",
            "path",
            "required",
            "YAML file describing each stand-in robot and its conditions.",
          ],
          ["--episodes, -n", "integer, 1 or more", "20", "Attempts per robot."],
          ["--seed", "integer", "5000", "Seed of the first attempt of the first robot."],
          ["--device", "text", "automatic", "cuda, mps or cpu."],
          ["--url", "text", "SHAKEDOWN_URL", "Base URL of the Shakedown server."],
          ["--api-key", "text", "SHAKEDOWN_API_KEY", "Project API key."],
        ]}
      />
      <P>
        Exits with code 2 when the channel has no release, when the file of robots cannot be
        read, when the policy cannot be loaded, and when reports could not be sent.
      </P>

      <H2 id="real-record">shakedown real record</H2>
      <P>
        Logs the outcome of real-robot trials, one condition at a time. The command is
        interactive. It does not move the robot: for each trial you set up the condition
        shown, run the policy with your own tooling, and answer whether the trial succeeded.
        See <A href="/docs/sim-to-real">Sim-to-real validation</A>.
      </P>
      <CodeBlock lang="shell" code="shakedown real record [OPTIONS] SUITE" />
      <Arguments
        command="shakedown real record"
        rows={[["SUITE", "path", "required", "The scenario suite that was run in simulation."]]}
      />
      <Options
        command="shakedown real record"
        rows={[
          [
            "--policy-label, -l",
            "text",
            "required",
            "Label of the policy, as used in the simulated run.",
          ],
          ["--trials, -n", "integer, 1 or more", "10", "Trials per condition."],
          ["--out, -o", "path", "real-trials.jsonl", "The trial log to append to."],
          ["--robot", "text", "empty", "Which robot, for example so101."],
          ["--operator", "text", "empty", "Who ran the trials."],
          ["--only", "text", "none", "Record only these condition keys. Repeatable."],
        ]}
      />
      <DocTable
        caption="Answers at the prompt of shakedown real record"
        head={["Answer", "Effect"]}
        rows={[
          ["y", "Record a success."],
          ["n", "Record a failure, then ask what went wrong. The note may be left empty."],
          ["s", "Skip the rest of this condition and go to the next."],
          ["q", "Stop. Trials recorded so far are already saved."],
        ]}
      />
      <P>
        Each answer is written to the log at once. Running the command again with the same log
        resumes where it stopped, and skips conditions that already have the requested number
        of trials. An unknown key given to <C>--only</C> exits with code 2.
      </P>

      <H2 id="real-correlate">shakedown real correlate</H2>
      <P>
        Compares the success rates of a simulated run with those measured on the real robot,
        condition by condition, and prints the Pearson correlation and the mean maximum rank
        violation.
      </P>
      <CodeBlock lang="shell" code="shakedown real correlate [OPTIONS] RUN [TRIALS]" />
      <Arguments
        command="shakedown real correlate"
        rows={[
          ["RUN", "path", "required", "A simulated run directory or result file."],
          ["TRIALS", "path", "real-trials.jsonl", "The real-trial log."],
        ]}
      />
      <Options
        command="shakedown real correlate"
        rows={[
          ["--upload", "flag", "off", "Send the real trials to the server."],
          ["--url", "text", "SHAKEDOWN_URL", "Base URL of the Shakedown server."],
          ["--api-key", "text", "SHAKEDOWN_API_KEY", "Project API key."],
          ["--json", "flag", "off", "Print the comparison as JSON."],
          ["--robot", "text", "none", "Use only trials from this robot."],
        ]}
      />
      <P>
        Only trials whose policy label and suite equal those of the run are used. The command
        exits with code 2 when the run or the log cannot be read, when the log is empty, when
        the log holds trials from several robots and <C>--robot</C> was not given, and with{" "}
        <C>--upload</C> when no trial matches the run. It exits 0 otherwise, whatever the
        correlation: it reports, it does not gate.
      </P>

      <H2 id="scan-import">shakedown scan import</H2>
      <P>
        Converts a scanned mesh into collision geometry and a visual mesh for MuJoCo, written
        as a scene directory for the <C>scanned_scene</C> perturbation. Needs the{" "}
        <C>scan</C> extra. See <A href="/docs/scans">Scanning a workcell</A>.
      </P>
      <CodeBlock lang="shell" code="shakedown scan import [OPTIONS] MESH" />
      <Arguments
        command="shakedown scan import"
        rows={[["MESH", "path", "required", "A scanned mesh: OBJ, GLB, PLY or STL."]]}
      />
      <Options
        command="shakedown scan import"
        rows={[
          ["--out, -o", "path", "required", "Directory to write the scene to."],
          ["--scale", "number", "1.0", "Multiply the scan’s units to get meters."],
          ["--up", "y or z", "z", "The axis pointing up in the scan."],
          ["--max-hulls", "integer, 1 to 512", "32", "Largest number of convex pieces."],
          [
            "--threshold",
            "number, 0.01 to 1.0",
            "0.05",
            "Convex decomposition tolerance. Lower follows the surface more closely.",
          ],
          ["--preview / --no-preview", "flag", "--preview", "Render preview.png."],
        ]}
      />
      <P>
        Errors exit with code 2. When the preview cannot be rendered because MuJoCo is not
        installed, the scene is still written, the command prints a note, and exits with code
        0. Importing into a directory that holds an earlier import replaces it.
      </P>

      <H2 id="environment">Environment variables</H2>
      <DocTable
        caption="Environment variables read by the CLI"
        head={["Variable", "Used by", "Meaning"]}
        rows={[
          [
            "SHAKEDOWN_URL",
            "run, upload, real correlate, release, field",
            "Base URL of the Shakedown server. No default.",
          ],
          [
            "SHAKEDOWN_API_KEY",
            "run, upload, real correlate, release, field",
            "Project API key.",
          ],
          [
            "SHAKEDOWN_POLICY_TOKEN",
            "run, serve-policy",
            "Bearer token for a served policy: required by serve-policy, sent by run.",
          ],
          [
            "SHAKEDOWN_CACHE",
            "run, tune, serve-policy, field simulate",
            "Root directory for migrated checkpoints. Defaults to ~/.cache/shakedown.",
          ],
          [
            "MUJOCO_GL",
            "run",
            "MuJoCo rendering backend. Set to egl on Linux and glfw on macOS when not already set.",
          ],
          [
            "GITHUB_STEP_SUMMARY",
            "run",
            "When set, the Markdown summary is appended to this file.",
          ],
        ]}
      />
      <P>
        The GitHub variables used for commit metadata are listed in{" "}
        <A href="/docs/ci#secrets">Running in CI</A>.
      </P>
      <UL>
        <LI>
          For <C>--url</C>, <C>--api-key</C>, <C>--policy-token</C> and <C>--token</C>, a value
          on the command line takes precedence over the environment variable.
        </LI>
      </UL>
    </DocPage>
  );
}
