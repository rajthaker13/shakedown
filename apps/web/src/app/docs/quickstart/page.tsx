import { CodeBlock } from "@/components/docs/code-block";
import { DocPage } from "@/components/docs/doc-page";
import { pageMetadata } from "@/components/docs/nav";
import { A, C, Callout, H2, H3, LI, P, UL } from "@/components/docs/prose";
import { DocTable } from "@/components/docs/table";
import type { TocItem } from "@/components/docs/toc";

const href = "/docs/quickstart";

export const metadata = pageMetadata(href);

const toc: TocItem[] = [
  { id: "requirements", title: "Requirements" },
  { id: "install", title: "Install" },
  { id: "init", title: "Write a starter suite" },
  { id: "validate", title: "Validate the suite" },
  { id: "first-run", title: "Run against a checkpoint" },
  { id: "read-the-table", title: "Read the table" },
  { id: "baseline", title: "Compare with a baseline" },
  { id: "run-directory", title: "Where results are written" },
  { id: "result-json", title: "result.json", level: 3 },
  { id: "episode-files", title: "Episode traces and videos", level: 3 },
  { id: "reprint", title: "Printing a saved result", level: 3 },
  { id: "next-steps", title: "Next steps" },
];

const install = `git clone <repository-url> shakedown
cd shakedown
python -m venv .venv
source .venv/bin/activate
pip install -e "engine[lerobot,server]"
shakedown --version`;

const initCmd = `shakedown init`;

const initOut = `wrote scenarios/nominal.yaml
wrote scenarios/camera-pan.yaml

Next: shakedown run scenarios --policy lerobot:<checkpoint> --label v1`;

const nominalYaml = `version: 1
name: nominal
description: The task exactly as the policy was trained on it. Every other scenario is compared with this.
env: aloha/transfer_cube
episodes: 50
seed: 1000
assertions:
  success_rate: { min: 0.8 }`;

const sweepYaml = `version: 1
name: camera-pan
description: The top camera is rotated about its vertical axis, as after a knock to its mount.
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
  regression: { max_drop: 0.10 }`;

const validateOut = `┏━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━━━━┳━━━━━━━━━━━━━━━┓
┃ Scenario   ┃ Environment         ┃ Conditions ┃ Episodes ┃ Perturbations ┃
┡━━━━━━━━━━━━╇━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━━━━━╇━━━━━━━━━━━━━━━┩
│ camera-pan │ aloha/transfer_cube │          3 │      150 │ camera_pose   │
│ nominal    │ aloha/transfer_cube │          1 │       50 │ none          │
└────────────┴─────────────────────┴────────────┴──────────┴───────────────┘
2 scenario file(s) are valid.`;

const smokeRun = `shakedown run scenarios \\
  --policy lerobot:lerobot/act_aloha_sim_transfer_cube_human \\
  --label v1 \\
  --episodes 5`;

const firstRun = `shakedown run scenarios \\
  --policy lerobot:lerobot/act_aloha_sim_transfer_cube_human \\
  --label v1 \\
  --out runs/v1`;

const tableOut = `scenarios  ·  v1
┏━━━┳━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━━━━━━━━┳━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃   ┃ Condition          ┃    Success ┃ 95% interval ┃ Δ pts ┃ Result                                        ┃
┡━━━╇━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━━━━━━━━━╇━━━━━━━╇━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┩
│ ✓ │ nominal            │ 90%  45/50 │      79%–96% │     – │ 90% meets the 80% minimum                     │
│ ✓ │ camera-pan · pan=1 │ 86%  43/50 │      74%–93% │     – │ 86% meets the 60% minimum                     │
│ ! │ camera-pan · pan=2 │ 54%  27/50 │      40%–67% │     – │ 54% is below the 60% minimum, but 50 episodes │
│   │                    │            │              │       │ cannot rule out noise (interval 40% to 67%).  │
│   │                    │            │              │       │ The rate is too close to the minimum to       │
│   │                    │            │              │       │ separate with a practical number of episodes  │
│ ✗ │ camera-pan · pan=4 │ 24%  12/50 │      14%–37% │     – │ 24% is below the 60% minimum (interval 14% to │
│   │                    │            │              │       │ 37%)                                          │
└───┴────────────────────┴────────────┴──────────────┴───────┴───────────────────────────────────────────────┘
FAIL   2 passed, 1 warned, 1 failed  ·  200 episodes in 1840s
results: runs/v1/result.json`;

const secondRun = `shakedown run scenarios \\
  --policy lerobot:outputs/train/act_v2/checkpoints/last/pretrained_model \\
  --label v2 \\
  --baseline runs/v1 \\
  --out runs/v2`;

const compareCmd = `shakedown compare runs/v1 runs/v2`;

const tree = `runs/v1/
├── result.json                     # the whole run: verdicts, statistics, per-episode summaries
├── episodes/
│   ├── nominal/
│   │   ├── 1000.json               # per-step signals and contacts for seed 1000
│   │   └── 1000.mp4                # replay video, when one was kept
│   ├── camera-pan_1/               # condition key camera-pan@1
│   ├── camera-pan_2/
│   └── camera-pan_4/
└── nominal/
    └── aloha_transfer_cube-400-1000.npz   # unperturbed action traces, used for divergence`;

const reportCmd = `shakedown report runs/v1
shakedown report runs/v1 --format markdown
shakedown report runs/v1 --format junit
shakedown report runs/v1 --format json`;

export default function QuickstartPage() {
  return (
    <DocPage
      href={href}
      toc={toc}
      lead="Install the engine from source, write a two-file starter suite, run it against a public LeRobot checkpoint, then run a second checkpoint against the first as a baseline."
    >
      <Callout title="The fastest way to a first result">
        <p>
          If your model is a public Hugging Face model trained on the simulated ALOHA
          transfer-cube task or on PushT, you can test it without installing anything: start
          a <A href="/docs/cloud-runs">cloud run</A> from the dashboard. For your own scenes,
          private checkpoints or a policy trained on a real robot, continue here.
        </p>
      </Callout>

      <H2 id="requirements">Requirements</H2>
      <UL>
        <LI>
          Python 3.10 or newer. Node.js is not needed for the CLI, and the dashboard is
          optional: every command on this page works without a server.
        </LI>
        <LI>
          A machine that can render with OpenGL. On Linux the engine uses EGL for headless
          rendering. On macOS it uses GLFW.
        </LI>
        <LI>
          A GPU is optional. Policy inference runs on CUDA, on Apple MPS, or on the CPU. A full
          suite on the CPU is slow.
        </LI>
      </UL>

      <H2 id="install">Install</H2>
      <P>
        Shakedown is installed from source for now. Clone the repository and install the{" "}
        <C>engine</C> directory in editable mode. Replace <C>&lt;repository-url&gt;</C> with the
        URL of the Shakedown repository you were given access to.
      </P>
      <CodeBlock lang="shell" code={install} />
      <P>
        The Python package is named <C>shakedown-ci</C> and installs one command,{" "}
        <C>shakedown</C>. The base install contains the runner, the statistics and the reports,
        but no simulator. Simulators and policy loaders are optional extras:
      </P>
      <DocTable
        caption="Optional extras of the shakedown-ci package"
        head={["Extra", "Installs", "Needed for"]}
        rows={[
          [
            "lerobot",
            "LeRobot with its aloha and pusht extras, which bring in gym-aloha and gym-pusht",
            <>
              Loading <C>lerobot:</C> checkpoints. Also enough to run all built-in environments.
            </>,
          ],
          [
            "mujoco",
            "mujoco, dm_control, gymnasium, gym-aloha",
            <>
              The <C>aloha/*</C> environments without LeRobot, for example when the policy is
              served over HTTP.
            </>,
          ],
          [
            "pusht",
            "gymnasium, gym-pusht",
            <>
              The <C>pusht</C> environment without LeRobot.
            </>,
          ],
          [
            "server",
            "fastapi, uvicorn",
            <>
              <C>shakedown serve-policy</C>.
            </>,
          ],
          [
            "scan",
            "trimesh, coacd, mujoco",
            <>
              <C>shakedown scan import</C>. See <A href="/docs/scans">Scanning a workcell</A>.
            </>,
          ],
          ["dev", "pytest, ruff", "Working on the engine itself."],
        ]}
      />

      <H2 id="init">Write a starter suite</H2>
      <P>
        <C>shakedown init</C> writes two scenario files into <C>scenarios/</C>. Pass a directory
        to write somewhere else. Files that already exist are skipped, never overwritten.
      </P>
      <CodeBlock lang="shell" code={initCmd} />
      <CodeBlock filename="Example output" code={initOut} />
      <P>
        The first file is the nominal scenario: the task with no perturbation, 50 episodes, and
        a minimum success rate of 80%.
      </P>
      <CodeBlock lang="yaml" filename="scenarios/nominal.yaml" code={nominalYaml} />
      <P>
        The second file sweeps a camera rotation over three values. It expands into three
        conditions: <C>camera-pan@1</C>, <C>camera-pan@2</C> and <C>camera-pan@4</C>.
      </P>
      <CodeBlock lang="yaml" filename="scenarios/camera-pan.yaml" code={sweepYaml} />

      <H2 id="validate">Validate the suite</H2>
      <P>
        <C>shakedown validate</C> parses every file, expands sweeps, and builds the scene of
        every condition and resets it once. That finds a misnamed camera, a missing scan or an
        unsupported perturbation before a run has spent time reaching it. It does not load a
        policy and runs no episodes.
      </P>
      <CodeBlock lang="shell" code="shakedown validate scenarios" />
      <CodeBlock filename="Example output" code={validateOut} />
      <P>
        The Episodes column is the total across conditions: 3 conditions of 50 episodes is 150.
      </P>

      <H2 id="first-run">Run against a checkpoint</H2>
      <P>
        The example uses <C>lerobot/act_aloha_sim_transfer_cube_human</C>, an ACT checkpoint
        published on the Hugging Face Hub. A policy spec is <C>lerobot:</C> followed by a Hub
        id or a local path.
      </P>
      <P>
        Start with a short run to confirm that the simulator renders and the policy loads.{" "}
        <C>--episodes</C> overrides the episode count of every scenario.
      </P>
      <CodeBlock lang="shell" code={smokeRun} />
      <Callout title="Older checkpoints are migrated on first use">
        <p>
          Checkpoints saved before LeRobot moved normalization into processor pipelines have
          no <C>policy_preprocessor.json</C>. Shakedown detects this, converts the checkpoint
          with LeRobot’s own migration script, and caches the result under{" "}
          <C>~/.cache/shakedown/checkpoints</C>. Set <C>SHAKEDOWN_CACHE</C> to move the cache.
          The original checkpoint is not modified. The first run takes longer because of the
          download and the migration.
        </p>
      </Callout>
      <P>
        Then run the full suite. Five episodes are too few to decide anything.{" "}
        <C>shakedown run</C> makes the same check as <C>shakedown validate</C> before it loads
        the policy.
      </P>
      <CodeBlock lang="shell" code={firstRun} />
      <P>
        Without <C>--out</C> the run directory is <C>runs/&lt;timestamp&gt;-&lt;label&gt;</C>,
        for example <C>runs/20260301-101500-v1</C>. Without <C>--label</C> the label is the
        last component of the checkpoint path.
      </P>

      <H2 id="read-the-table">Read the table</H2>
      <P>
        When the run finishes, the CLI prints one row per condition. The values below are
        illustrative.
      </P>
      <CodeBlock filename="Example output" code={tableOut} />
      <DocTable
        caption="Columns of the terminal report"
        head={["Column", "Meaning"]}
        monoFirst={false}
        rows={[
          [
            "Mark",
            <>
              <C>✓</C> PASS, <C>!</C> WARN, <C>✗</C> FAIL, <C>–</C> SKIP, <C>E</C> ERROR.
            </>,
          ],
          [
            "Condition",
            <>
              The scenario name. For a sweep, the name followed by the swept variable and its
              value.
            </>,
          ],
          ["Success", "Success rate, then successful episodes over episodes run."],
          ["95% interval", "Wilson score interval for the success rate."],
          [
            "Δ pts",
            <>
              Change in success rate against the baseline, in percentage points. <C>–</C> when
              there is no baseline.
            </>,
          ],
          ["Result", "The message of the most severe check for that condition."],
        ]}
      />
      <P>In the example:</P>
      <UL>
        <LI>
          <C>pan=2</C> is a WARN. 54% is below the 60% minimum, but the upper end of the
          interval, 67%, is above it. Fifty episodes cannot tell the two apart, and the message
          says that no practical number of episodes would.
        </LI>
        <LI>
          <C>pan=4</C> is a FAIL. The whole interval, 14% to 37%, is below the minimum.
        </LI>
        <LI>
          The run verdict is the worst condition verdict, so the run is a FAIL and the command
          exits with code 1.
        </LI>
      </UL>

      <H2 id="baseline">Compare with a baseline</H2>
      <P>
        Pass the first run as <C>--baseline</C> when you test the next checkpoint. The value is
        a run directory or a <C>result.json</C> file.
      </P>
      <CodeBlock lang="shell" code={secondRun} />
      <P>
        With a baseline, every condition gets a regression check, and the Δ pts column is
        filled in. Both runs used the same scenario files, so every condition has the same
        seeds and the comparison is paired: Shakedown looks at which seeds the baseline solved
        and the candidate did not, and the other way round. The default rule fails a condition
        when the success rate drops by more than 5 percentage points and the exact McNemar test
        gives p below 0.05. The starter <C>camera-pan</C> scenario relaxes the allowed drop to
        10 points.
      </P>
      <Callout kind="warning" title="Keep the episode count the same">
        <p>
          A run with <C>--episodes 5</C> and a run with 50 episodes do not share a fingerprint.
          They are compared with an unpaired Fisher test, which is much less sensitive. See{" "}
          <A href="/docs/scenarios#fingerprint">the fingerprint</A>.
        </p>
      </Callout>
      <P>
        To compare two runs that already exist, without running anything, use{" "}
        <C>shakedown compare</C>:
      </P>
      <CodeBlock lang="shell" code={compareCmd} />

      <H2 id="run-directory">Where results are written</H2>
      <CodeBlock filename="Run directory" code={tree} />
      <H3 id="result-json">result.json</H3>
      <P>
        The complete result. It holds the policy label and spec, git commit metadata, the host
        platform, the run verdict, a summary, and for each condition the success rate, interval,
        checks, comparison, fingerprint, per-seed outcomes and a summary of every episode. A
        later run reads this file as its baseline.
      </P>
      <H3 id="episode-files">Episode traces and videos</H3>
      <P>
        Each episode writes <C>episodes/&lt;condition&gt;/&lt;seed&gt;.json</C> with its
        per-step signals, the first step of each contact group, and for a failed episode of a
        perturbed condition the first divergent step and whether the same seed succeeds with
        no perturbation. In directory names, every character of the condition key other
        than letters, digits, <C>.</C>, <C>_</C> and <C>-</C> is replaced with <C>_</C>.
      </P>
      <P>
        With the default <C>--videos failures</C>, a condition keeps videos of up to 8 failed
        episodes and 1 successful episode. <C>--videos all</C> keeps every episode and{" "}
        <C>--videos none</C> keeps none. Videos are H.264 MP4 files. The left half shows the
        image the policy received, after any observation perturbations. The right half shows an
        external camera. One frame is recorded every 2 control steps.
      </P>
      <H3 id="reprint">Printing a saved result</H3>
      <CodeBlock lang="shell" code={reportCmd} />

      <H2 id="next-steps">Next steps</H2>
      <UL>
        <LI>
          <A href="/docs/scenarios">Scenarios</A> describes every field of the file format.
        </LI>
        <LI>
          <A href="/docs/perturbations">Perturbations</A> lists every condition you can test.
        </LI>
        <LI>
          <A href="/docs/ci">Running in CI</A> runs the suite on every pull request.
        </LI>
        <LI>
          <A href="/docs/runtime-settings">Runtime settings</A> tests the settings the
          checkpoint is deployed with, not only the checkpoint.
        </LI>
      </UL>
    </DocPage>
  );
}
