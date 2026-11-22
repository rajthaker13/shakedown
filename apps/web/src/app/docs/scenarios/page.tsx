import { CodeBlock } from "@/components/docs/code-block";
import { DocPage } from "@/components/docs/doc-page";
import { pageMetadata } from "@/components/docs/nav";
import { A, C, Callout, H2, H3, LI, P, Strong, UL } from "@/components/docs/prose";
import { DocTable } from "@/components/docs/table";
import type { TocItem } from "@/components/docs/toc";

const href = "/docs/scenarios";

export const metadata = pageMetadata(href);

const toc: TocItem[] = [
  { id: "overview", title: "Overview" },
  { id: "suites", title: "Suites" },
  { id: "fields", title: "Fields" },
  { id: "perturbation-entries", title: "Perturbation entries" },
  { id: "sweeps", title: "Sweeps" },
  { id: "assertions", title: "Assertions" },
  { id: "success-rate", title: "success_rate", level: 3 },
  { id: "regression", title: "regression", level: 3 },
  { id: "no-contact", title: "no_contact", level: 3 },
  { id: "max-steps", title: "max_steps", level: 3 },
  { id: "verdicts", title: "From checks to a verdict" },
  { id: "seeds", title: "Seeds" },
  { id: "fingerprint", title: "The fingerprint" },
  { id: "bundled", title: "Bundled suites" },
  { id: "examples", title: "Complete examples" },
  { id: "example-nominal", title: "Nominal", level: 3 },
  { id: "example-sweep", title: "A sweep inside a list", level: 3 },
  { id: "example-contact", title: "A contact assertion", level: 3 },
];

const minimal = `version: 1
name: nominal
env: aloha/transfer_cube`;

const entries = `perturbations:
  - image_blur                              # a bare name uses the defaults
  - lighting: { intensity: 0.4 }            # flow mapping
  - camera_pose:                            # block mapping
      camera: top
      pan_deg: 2`;

const sweep = `sweep:
  name: level
  values: [0.7, 0.4]
perturbations:
  - lighting: { intensity: "\${level}", ambient: "\${level}" }`;

const assertions = `assertions:
  success_rate: { min: 0.7 }
  regression: { max_drop: 0.05, confidence: 0.95 }
  no_contact: { between: robot, and: table, max_violation_rate: 0.0 }
  max_steps: { mean: 300 }`;

const fingerprint = `{
  "env": "aloha/transfer_cube",
  "episodes": 50,
  "max_steps": null,
  "perturbations": [{ "camera_pose": { "camera": "top", "pan_deg": 2 } }],
  "seed": 1000
}`;

const exNominal = `version: 1
name: nominal
description: The task exactly as the policy was trained on it. Every other scenario is read against this one.
env: aloha/transfer_cube
episodes: 50
seed: 1000
assertions:
  success_rate: { min: 0.8 }
tags: [baseline]`;

const exShift = `version: 1
name: camera-shift
description: The top camera is remounted a few centimeters from where it was during data collection.
env: aloha/transfer_cube
episodes: 50
seed: 1000
sweep:
  name: dx
  values: [1, 3]
perturbations:
  - camera_pose: { camera: top, translate_cm: ["\${dx}", 0, 0] }
assertions:
  success_rate: { min: 0.6 }
tags: [vision, camera]`;

const exDistractors = `version: 1
name: distractors
description: Unrelated objects left on the work surface.
env: aloha/transfer_cube
episodes: 50
seed: 1000
perturbations:
  - distractors: { count: 4, shape: mixed, layout_seed: 3 }
assertions:
  success_rate: { min: 0.6 }
  no_contact: { between: robot, and: distractor, max_violation_rate: 0.1 }
tags: [vision, clutter]`;

export default function ScenariosPage() {
  return (
    <DocPage
      href={href}
      toc={toc}
      lead="A scenario is a YAML file that names an environment, the perturbations applied to it, how many seeded episodes to run, and the assertions that decide the verdict."
    >
      <H2 id="overview">Overview</H2>
      <P>
        A scenario without a sweep is one <Strong>condition</Strong>: one row of the result. A
        scenario with a sweep expands into one condition per swept value. Only <C>name</C> and{" "}
        <C>env</C> are required:
      </P>
      <CodeBlock lang="yaml" code={minimal} />
      <P>
        Unknown fields are rejected at every level of the file. A misspelled key is an error,
        not a silently ignored setting. Check files with <C>shakedown validate</C>, which also
        builds the scene of every condition once. <C>shakedown run</C> makes the same check
        before it loads the policy, and exits with code 2 and a list of every problem it
        found.
      </P>

      <H2 id="suites">Suites</H2>
      <P>
        A suite is a directory of scenario files. <C>shakedown run</C> and{" "}
        <C>shakedown validate</C> accept a single file or a directory. A directory is searched
        recursively for <C>*.yaml</C> and <C>*.yml</C> files, which are loaded in sorted path
        order. Numeric prefixes such as <C>00-nominal.yaml</C> control the order of rows in
        reports.
      </P>
      <UL>
        <LI>Scenario names must be unique within a suite.</LI>
        <LI>
          The suite name is the directory name, or the file name without its extension when you
          pass a single file. Uploaded runs are grouped and given baselines by suite name.
        </LI>
        <LI>
          Conditions with no perturbations run first, whatever their position, so that their
          action traces are available for{" "}
          <A href="/docs/statistics#first-divergence">first-divergence detection</A>.
        </LI>
      </UL>

      <H2 id="fields">Fields</H2>
      <DocTable
        caption="Top-level fields of a scenario file"
        head={["Field", "Type", "Default", "Meaning"]}
        rows={[
          ["version", "integer", "1", "Schema version. Must be 1."],
          [
            "name",
            "string",
            "required",
            <>
              Identifies the scenario in results and baselines. Starts with a lowercase letter
              or digit, then lowercase letters, digits, <C>.</C>, <C>_</C> or <C>-</C>.
            </>,
          ],
          ["description", "string", "empty", "Free text shown with the results."],
          [
            "env",
            "string",
            "required",
            <>
              Environment id, for example <C>aloha/transfer_cube</C>. See{" "}
              <A href="/docs/environments">Environments</A>.
            </>,
          ],
          [
            "episodes",
            "integer",
            "50",
            "Episodes per condition. From 1 to 100000.",
          ],
          [
            "seed",
            "integer",
            "1000",
            <>
              Seed of the first episode. Must be 0 or greater. Episode <C>i</C> uses{" "}
              <C>seed + i</C>.
            </>,
          ],
          [
            "max_steps",
            "integer or null",
            "null",
            <>
              Control steps after which an episode is cut off and counted as a failure. When
              null, the environment’s own limit applies: 400 for the ALOHA tasks, 300 for{" "}
              <C>pusht</C>.
            </>,
          ],
          [
            "perturbations",
            "list",
            "empty",
            <>
              Perturbations to apply, in order. See{" "}
              <A href="#perturbation-entries">Perturbation entries</A>.
            </>,
          ],
          [
            "sweep",
            "mapping or null",
            "null",
            <>
              One variable and the values it takes. See <A href="#sweeps">Sweeps</A>.
            </>,
          ],
          [
            "assertions",
            "mapping",
            "empty",
            <>
              The checks that decide the verdict. See <A href="#assertions">Assertions</A>.
            </>,
          ],
          [
            "tags",
            "list of strings",
            "empty",
            "Free-form labels stored with each condition in the result.",
          ],
        ]}
      />

      <H2 id="perturbation-entries">Perturbation entries</H2>
      <P>
        Each entry of <C>perturbations</C> is a mapping with exactly one key, the perturbation
        name, whose value holds the parameters. A bare name is accepted and uses every default.
      </P>
      <CodeBlock lang="yaml" code={entries} />
      <P>
        Parameters are validated against the perturbation’s definition. Unknown parameters and
        values outside the allowed range are errors. The full list is in{" "}
        <A href="/docs/perturbations">Perturbations</A>.
      </P>
      <P>
        A scenario may combine several perturbations. Observation and action perturbations are
        applied in the order listed.
      </P>

      <H2 id="sweeps">Sweeps</H2>
      <P>
        A sweep runs the same scenario at several strengths of a perturbation, which locates
        the point at which a policy breaks. A scenario has at most one sweep, with one variable.
      </P>
      <DocTable
        caption="Fields of a sweep"
        head={["Field", "Type", "Meaning"]}
        rows={[
          [
            "name",
            "string",
            <>
              The variable name, used as <C>{"${name}"}</C> inside perturbation parameters.
            </>,
          ],
          [
            "values",
            "list of numbers or strings",
            "The values to run. Must not be empty. Each value is one condition.",
          ],
        ]}
      />
      <CodeBlock lang="yaml" code={sweep} />
      <P>Rules for the template syntax:</P>
      <UL>
        <LI>
          Write the template as a quoted string: <C>{'"${level}"'}</C>. Unquoted, the braces
          are a YAML syntax error inside a flow mapping or a flow list.
        </LI>
        <LI>
          When the string is only the template, the value keeps its type. <C>{'"${level}"'}</C>{" "}
          with the value <C>0.7</C> becomes the number 0.7, not the string.
        </LI>
        <LI>
          When the template is part of a longer string, the value is inserted as text.
        </LI>
        <LI>
          Templates are replaced anywhere inside <C>perturbations</C>, including inside lists:{" "}
          <C>{'translate_cm: ["${dx}", 0, 0]'}</C>.
        </LI>
        <LI>
          A sweep that is never referenced is an error. So is a template that names a variable
          other than the sweep’s, and a template in a file with no sweep.
        </LI>
      </UL>
      <P>Each swept value produces a condition with:</P>
      <DocTable
        caption="How a swept condition is named"
        head={["Property", "Format", "Example"]}
        rows={[
          ["key", <C key="k">name@value</C>, <C key="e">lighting-dim@0.4</C>],
          ["label", <C key="k">name · variable=value</C>, <C key="e">lighting-dim · level=0.4</C>],
        ]}
      />
      <P>
        The key identifies the condition in baselines. The episode count, seed and assertions
        of the scenario apply to every one of its conditions.
      </P>

      <H2 id="assertions">Assertions</H2>
      <P>
        Each assertion produces one check with its own verdict. All four are optional.
      </P>
      <CodeBlock lang="yaml" code={assertions} />

      <H3 id="success-rate" mono>
        success_rate
      </H3>
      <P>Requires a minimum success rate.</P>
      <DocTable
        caption="Parameters of the success_rate assertion"
        head={["Parameter", "Type", "Default", "Meaning"]}
        rows={[["min", "number, 0 to 1", "required", "The lowest acceptable success rate."]]}
      />
      <DocTable
        caption="Verdict of the success_rate check"
        head={["Verdict", "Condition"]}
        rows={[
          ["PASS", "The observed rate is at or above min."],
          [
            "WARN",
            "The observed rate is below min, but the upper bound of the 95% Wilson interval is at or above min. The message states roughly how many episodes would settle it, or that the rate is too close to min to settle with a practical number.",
          ],
          ["FAIL", "The upper bound of the 95% Wilson interval is below min."],
        ]}
      />
      <P>
        The confidence level of this check is fixed at 95%. Note that PASS depends only on the
        observed rate: a condition passes at 41 of 50 against a minimum of 0.8 even though the
        interval extends below 0.8.
      </P>

      <H3 id="regression" mono>
        regression
      </H3>
      <P>Limits how far the success rate may fall below the baseline run.</P>
      <DocTable
        caption="Parameters of the regression assertion"
        head={["Parameter", "Type", "Default", "Meaning"]}
        rows={[
          [
            "max_drop",
            "number, 0 to 1",
            "0.05",
            "Largest acceptable drop in success rate, as a fraction. 0.05 is 5 percentage points.",
          ],
          [
            "confidence",
            "0.8, 0.9, 0.95 or 0.99",
            "0.95",
            "A drop larger than max_drop fails only when the p-value is below 1 − confidence. Any other value is rejected.",
          ],
        ]}
      />
      <DocTable
        caption="Verdict of the regression check"
        head={["Verdict", "Condition"]}
        rows={[
          ["PASS", "The drop is at most max_drop. An improvement always passes."],
          ["FAIL", "The drop exceeds max_drop and the p-value is below 1 − confidence."],
          ["WARN", "The drop exceeds max_drop but the p-value is not below 1 − confidence."],
          ["SKIP", "The scenario asserts regression but the run has no baseline."],
        ]}
      />
      <UL>
        <LI>
          The drop is the baseline success rate minus the candidate success rate.
        </LI>
        <LI>
          When a run has a baseline, the regression check is applied to{" "}
          <Strong>every</Strong> condition found in it, with the default rule, even when the
          scenario does not list <C>regression</C>. List it only to change <C>max_drop</C> or{" "}
          <C>confidence</C>.
        </LI>
        <LI>
          Conditions are matched to the baseline by key. A renamed scenario or a new sweep
          value has no baseline and gets no regression check.
        </LI>
        <LI>
          The p-value comes from the exact McNemar test when the runs are paired, and from a
          two-sided Fisher exact test when they are not. See{" "}
          <A href="/docs/statistics">Statistics and verdicts</A>.
        </LI>
      </UL>

      <H3 id="no-contact" mono>
        no_contact
      </H3>
      <P>
        Limits the share of episodes in which two groups of bodies touch. Use it for contacts
        that should never happen, such as an arm link hitting the table.
      </P>
      <DocTable
        caption="Parameters of the no_contact assertion"
        head={["Parameter", "Type", "Default", "Meaning"]}
        rows={[
          [
            "between",
            "robot, gripper or object",
            "robot",
            "What moves: the robot’s links other than the fingers, its gripper fingers, or the task object.",
          ],
          [
            "and",
            "table, distractor or scene",
            "table",
            "What it must not touch: the work surface, a distractor, or a scanned scene.",
          ],
          [
            "max_violation_rate",
            "number, 0 to 1",
            "0.0",
            "Fraction of episodes allowed to have the contact.",
          ],
        ]}
      />
      <P>
        An episode violates the assertion when the contact group{" "}
        <C>&lt;between&gt;:&lt;and&gt;</C> occurs at any step. The check is PASS when the share
        of violating episodes is at most <C>max_violation_rate</C>, and FAIL otherwise. It never
        returns WARN.
      </P>
      <P>
        Any other value for <C>between</C> or <C>and</C> is rejected when the file is loaded,
        so a misspelled or reversed pair is an error. The pair{" "}
        <C>between: object, and: table</C> is rejected too: the task object rests on the
        table, so that contact is not tracked.
      </P>
      <Callout kind="warning" title="pusht reports no contacts">
        <p>
          The <C>pusht</C> environment reports no contacts at all, so <C>no_contact</C>{" "}
          always passes there.
        </p>
      </Callout>

      <H3 id="max-steps" mono>
        max_steps
      </H3>
      <P>
        Limits how long successful episodes take. This is the assertion{" "}
        <C>assertions.max_steps</C>, which is separate from the top-level <C>max_steps</C>{" "}
        field that cuts episodes off.
      </P>
      <DocTable
        caption="Parameters of the max_steps assertion"
        head={["Parameter", "Type", "Default", "Meaning"]}
        rows={[
          [
            "mean",
            "number above 0",
            "required",
            "Largest acceptable mean number of control steps across successful episodes.",
          ],
        ]}
      />
      <P>
        The check is PASS when the mean is at most <C>mean</C>, FAIL when it is higher, and
        SKIP when no episode succeeded. Failed episodes are not counted.
      </P>

      <H2 id="verdicts">From checks to a verdict</H2>
      <P>
        The verdict of a condition is the most severe verdict among its checks. The verdict of
        a run is the most severe verdict among its conditions. Severity, from lowest to
        highest:
      </P>
      <DocTable
        caption="Verdicts in order of severity"
        head={["Verdict", "Meaning"]}
        rows={[
          [
            "SKIP",
            "Nothing was checked. A condition with no assertions and no baseline is SKIP.",
          ],
          ["PASS", "Every check passed."],
          ["WARN", "A result looks bad, but the episode count cannot separate it from noise."],
          ["FAIL", "A check failed."],
          [
            "ERROR",
            "At least one episode raised an exception in the simulator, a perturbation or the policy, or the scene could not be built. This is an infrastructure fault, not a policy failure.",
          ],
        ]}
      />
      <P>
        Episodes that raised an exception are not policy failures. They are left out of every
        check, and out of <C>episodes</C>, <C>successes</C>, <C>success_rate</C> and{" "}
        <C>outcomes</C> in <C>result.json</C>. Each condition records how many there were in{" "}
        <C>errors</C>. The condition is still marked ERROR, whatever its checks say.
      </P>
      <P>
        When the scene of a condition cannot be built, for example because a perturbation
        names a camera that does not exist or a scanned scene is missing, no episode runs. The
        condition is ERROR with the message <C>could not build the scene: ...</C>, and the run
        carries on with the next condition.
      </P>

      <H2 id="seeds">Seeds</H2>
      <P>
        A condition with <C>seed: 1000</C> and <C>episodes: 50</C> runs seeds 1000 to 1049. The
        episode seed drives everything that is random in the episode:
      </P>
      <UL>
        <LI>The environment is reset with the seed, which fixes the initial object pose.</LI>
        <LI>
          The policy is reset with the seed. For LeRobot policies this seeds PyTorch, so
          sampling policies such as Diffusion Policy draw the same noise.
        </LI>
        <LI>
          Each observation and action perturbation gets its own random generator derived from
          the seed and its position in the list.
        </LI>
        <LI>
          The random part of <C>object_pose</C> (<C>jitter_cm</C>, <C>yaw_jitter_deg</C>) is
          derived from the seed.
        </LI>
      </UL>
      <P>
        The layout of <C>distractors</C> is the exception. It depends on the perturbation’s own{" "}
        <C>layout_seed</C> and is the same in every episode.
      </P>
      <P>
        Use the same <C>seed</C> across the scenarios of a suite, as the example suite does.
        Seed 1007 then starts from the same initial state in every condition, which lets you
        compare a failed perturbed episode with the nominal episode on the same seed.
      </P>
      <Callout title="Same seed does not guarantee the same outcome across machines">
        <p>
          Rendering and floating-point results can differ between GPUs, drivers and library
          versions. See <A href="/docs/limitations">Limitations</A>.
        </p>
      </Callout>

      <H2 id="fingerprint">The fingerprint</H2>
      <P>
        Every condition has a fingerprint: the first 16 hexadecimal characters of the SHA-256
        hash of everything that affects episode outcomes. It is computed after the sweep value
        has been substituted and is stored with the result.
      </P>
      <CodeBlock lang="json" filename="What is hashed" code={fingerprint} />
      <P>
        A condition that uses <C>scanned_scene</C> has one more entry, <C>scenes</C>: a hash
        of the files of each scanned scene, that is its <C>scene.json</C> and every{" "}
        <C>.obj</C> file in the directory. The fingerprint of a condition without a scan has
        no such entry.
      </P>
      <P>
        <C>name</C>, <C>description</C>, <C>tags</C> and <C>assertions</C> are not part of the
        fingerprint. You can tighten a threshold without breaking the pairing with older runs.
      </P>
      <P>
        Two runs of a condition are compared as a <Strong>paired</Strong> regression only when
        their fingerprints are equal and both have outcomes for exactly the same seeds. Pairing
        matters because most seeds give the same outcome under both checkpoints. A paired test
        ignores those and looks only at the seeds whose outcome changed, which detects a
        regression with far fewer episodes than comparing two independent success rates.
      </P>
      <P>These changes make a comparison unpaired:</P>
      <UL>
        <LI>
          changing <C>episodes</C>, <C>seed</C>, <C>max_steps</C>, <C>env</C> or any
          perturbation parameter,
        </LI>
        <LI>
          running with <C>--episodes</C>, which replaces the episode count before the
          fingerprint is computed,
        </LI>
        <LI>
          importing a scan again into the directory a <C>scanned_scene</C> points to, because
          the files of the scene have changed,
        </LI>
        <LI>
          an episode that raised an exception in either run, because its seed has no outcome
          to pair.
        </LI>
      </UL>
      <P>
        An unpaired comparison still runs, using a Fisher exact test, and is marked as
        unpaired in the check message.
      </P>

      <H2 id="bundled">Bundled suites</H2>
      <P>
        The repository has three suites under <C>scenarios/</C>. They are also the suites
        that <A href="/docs/cloud-runs">cloud runs</A> offer.
      </P>
      <DocTable
        caption="Suites bundled with the repository"
        head={["Suite", "Environment", "Conditions", "Tests"]}
        numeric={[2]}
        rows={[
          [
            "aloha-transfer-cube",
            "aloha/transfer_cube",
            "19",
            "Lighting, camera pose, object position, color and physics, distractors, sensor noise, action delay and actuator gain. Each scenario asserts a minimum success rate.",
          ],
          [
            "aloha-latency",
            "aloha/transfer_cube",
            "6",
            "Action delay alone: 2, 5 and 10 steps, and 5 and 10 steps again with a step limit of 600 in place of 400. No assertions.",
          ],
          [
            "pusht",
            "pusht",
            "6",
            "Block offset, block color, sensor noise and action delay of 2 steps. Each scenario asserts a minimum success rate.",
          ],
        ]}
      />
      <UL>
        <LI>
          <C>aloha-latency</C> has no assertions, so without a baseline every condition is
          SKIP. It is meant for comparing{" "}
          <A href="/docs/runtime-settings">runtime settings</A> with each other, not for
          gating.
        </LI>
        <LI>
          Its second sweep exists as a control. If success under delay recovers when the
          episode is given half as much time again, the failures under delay were slow
          episodes, not failed manipulation.
        </LI>
        <LI>
          One control step is 20 ms in the ALOHA suites and 100 ms in <C>pusht</C>, so a
          delay of 2 steps is 40 ms in one and 200 ms in the other.
        </LI>
        <LI>
          Without <C>latency_compensation</C>, results under <C>action_latency</C> describe a
          deployment that does not compensate for its delay. See{" "}
          <A href="/docs/runtime-settings#delay">Runtime settings</A>.
        </LI>
      </UL>

      <H2 id="examples">Complete examples</H2>
      <P>
        These files are from the example suite in <C>scenarios/aloha-transfer-cube/</C> of the
        repository. A second, smaller suite for the <C>pusht</C> environment is in{" "}
        <C>scenarios/pusht/</C>.
      </P>
      <H3 id="example-nominal">Nominal</H3>
      <P>No perturbations. Every suite should have one.</P>
      <CodeBlock lang="yaml" filename="scenarios/aloha-transfer-cube/00-nominal.yaml" code={exNominal} />
      <H3 id="example-sweep">A sweep inside a list</H3>
      <P>
        Two conditions, <C>camera-shift@1</C> and <C>camera-shift@3</C>, which move the top
        camera 1 cm and 3 cm along the world x axis.
      </P>
      <CodeBlock
        lang="yaml"
        filename="scenarios/aloha-transfer-cube/21-camera-shift.yaml"
        code={exShift}
      />
      <H3 id="example-contact">A contact assertion</H3>
      <P>
        Four distractor objects in a fixed layout. The condition fails when the success rate is
        clearly below 60%, or when an arm link touches a distractor in more than 10% of
        episodes.
      </P>
      <CodeBlock
        lang="yaml"
        filename="scenarios/aloha-transfer-cube/40-distractors.yaml"
        code={exDistractors}
      />
    </DocPage>
  );
}
