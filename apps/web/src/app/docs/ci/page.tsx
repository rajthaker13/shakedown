import { CodeBlock } from "@/components/docs/code-block";
import { CodeTabs } from "@/components/docs/code-tabs";
import { DocPage } from "@/components/docs/doc-page";
import { pageMetadata } from "@/components/docs/nav";
import { A, C, Callout, H2, H3, LI, P, Strong, UL } from "@/components/docs/prose";
import { DocTable } from "@/components/docs/table";
import type { TocItem } from "@/components/docs/toc";

const href = "/docs/ci";

export const metadata = pageMetadata(href);

const toc: TocItem[] = [
  { id: "overview", title: "Overview" },
  { id: "machine", title: "What the machine needs" },
  { id: "measured", title: "One measured run time", level: 3 },
  { id: "exit-codes", title: "Exit codes" },
  { id: "fail-on", title: "Failing on warnings", level: 3 },
  { id: "reports", title: "Reports" },
  { id: "junit", title: "JUnit XML", level: 3 },
  { id: "markdown", title: "Markdown summary", level: 3 },
  { id: "job-summary", title: "GitHub job summary", level: 3 },
  { id: "baselines", title: "Baselines in CI" },
  { id: "baseline-branch", title: "From the server", level: 3 },
  { id: "baseline-file", title: "From a file", level: 3 },
  { id: "secrets", title: "Required secrets" },
  { id: "workflow", title: "Complete workflow" },
  { id: "time", title: "Keeping run time down" },
];

const workflow = `name: policy-regression

on:
  pull_request:
  push:
    branches: [main]

jobs:
  shakedown:
    # Simulation needs OpenGL. A GPU runner is much faster; see "What the machine needs".
    runs-on: ubuntu-latest
    timeout-minutes: 180
    env:
      SHAKEDOWN_URL: \${{ secrets.SHAKEDOWN_URL }}
      SHAKEDOWN_API_KEY: \${{ secrets.SHAKEDOWN_API_KEY }}
      # Replace with the URL of the Shakedown repository.
      SHAKEDOWN_REPO: \${{ vars.SHAKEDOWN_REPO }}
      # A Hugging Face Hub id or a path inside this repository.
      POLICY_CHECKPOINT: \${{ vars.POLICY_CHECKPOINT }}
    steps:
      - name: Check out scenarios
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install EGL for headless rendering
        run: |
          sudo apt-get update
          sudo apt-get install -y libegl1 libgl1

      - name: Install Shakedown from source
        run: |
          git clone --depth 1 "$SHAKEDOWN_REPO" "$RUNNER_TEMP/shakedown"
          pip install -e "$RUNNER_TEMP/shakedown/engine[lerobot]"
          shakedown --version

      - name: Validate scenarios
        run: shakedown validate scenarios/aloha-transfer-cube

      - name: Run suite
        run: |
          shakedown run scenarios/aloha-transfer-cube \\
            --policy "lerobot:$POLICY_CHECKPOINT" \\
            --label "\${GITHUB_SHA::7}" \\
            --out runs/ci \\
            --upload \\
            --baseline-branch main \\
            --junit reports/shakedown.xml \\
            --markdown reports/shakedown.md \\
            --no-progress

      - name: Keep results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: shakedown-run
          path: |
            runs/ci
            reports`;

const shell = `#!/usr/bin/env bash
set -euo pipefail

# Required: SHAKEDOWN_URL, SHAKEDOWN_API_KEY, SHAKEDOWN_REPO, POLICY_CHECKPOINT, COMMIT_SHA

python -m venv .venv
source .venv/bin/activate

git clone --depth 1 "$SHAKEDOWN_REPO" .shakedown-src
pip install -e ".shakedown-src/engine[lerobot]"

shakedown validate scenarios/aloha-transfer-cube

shakedown run scenarios/aloha-transfer-cube \\
  --policy "lerobot:$POLICY_CHECKPOINT" \\
  --label "\${COMMIT_SHA::7}" \\
  --out runs/ci \\
  --upload \\
  --baseline-branch main \\
  --junit reports/shakedown.xml \\
  --markdown reports/shakedown.md \\
  --no-progress`;

const junit = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="shakedown.scenarios" tests="2" failures="1" errors="0" skipped="0" time="1840.00" timestamp="2026-03-01T10:15:00+00:00">
  <properties>
    <property name="policy" value="v2" />
    <property name="run_id" value="6f1c0c1e-3a57-4a59-9a0e-2f4d0f6f7b11" />
  </properties>
  <testcase classname="shakedown.nominal" name="nominal" time="310.00">
    <system-out>success_rate=0.9200 n=50 ci=[0.8116, 0.9685]
[PASS] success_rate: 92% meets the 80% minimum
[PASS] regression: up 2% on v1 (90% to 92%)</system-out>
  </testcase>
  <testcase classname="shakedown.camera-pan" name="camera-pan@4" time="395.00">
    <failure message="6% is below the 60% minimum (interval 2% to 16%)">[FAIL] success_rate: 6% is below the 60% minimum (interval 2% to 16%)
[FAIL] regression: down 18% on v1 (24% to 6%), p = 0.00391, paired on the same seeds</failure>
    <system-out>success_rate=0.0600 n=50 ci=[0.0206, 0.1622]
[FAIL] success_rate: 6% is below the 60% minimum (interval 2% to 16%)
[FAIL] regression: down 18% on v1 (24% to 6%), p = 0.00391, paired on the same seeds</system-out>
  </testcase>
</testsuite>`;

const markdownOut = `### Shakedown: FAIL

**Policy** \`v1\` (no baseline) · **Suite** \`scenarios\` · 200 episodes

| | Condition | Success | 95% interval | Δ pts | Result |
|---|---|---:|---:|---:|---|
| PASS | \`nominal\` | 90% (45/50) | 79%–96% | – | 90% meets the 80% minimum |
| PASS | \`camera-pan · pan=1\` | 86% (43/50) | 74%–93% | – | 86% meets the 60% minimum |
| WARN | \`camera-pan · pan=2\` | 54% (27/50) | 40%–67% | – | 54% is below the 60% minimum, but 50 episodes cannot rule out noise (interval 40% to 67%). The rate is too close to the minimum to separate with a practical number of episodes |
| FAIL | \`camera-pan · pan=4\` | 24% (12/50) | 14%–37% | – | 24% is below the 60% minimum (interval 14% to 37%) |`;

const baselineFile = `# On main, after a run: publish runs/ci/result.json somewhere the next job can fetch it.
# In the pull request job, after fetching it to baseline/result.json:
shakedown run scenarios/aloha-transfer-cube \\
  --policy "lerobot:$POLICY_CHECKPOINT" \\
  --baseline baseline/result.json \\
  --junit reports/shakedown.xml`;

const smoke = `shakedown run scenarios/aloha-transfer-cube \\
  --policy "lerobot:$POLICY_CHECKPOINT" \\
  --episodes 5 \\
  --videos none \\
  --no-progress`;

export default function CiPage() {
  return (
    <DocPage
      href={href}
      toc={toc}
      lead="Run a suite on every pull request and fail the job when a condition fails. This page covers exit codes, report files, baselines and a complete GitHub Actions workflow."
    >
      <H2 id="overview">Overview</H2>
      <P>
        <C>shakedown run</C> is built to be the last step of a CI job. It prints the result,
        writes report files, optionally uploads the run, and exits with a code that reflects
        the verdict. Nothing in it is specific to one CI system, apart from the automatic
        GitHub job summary.
      </P>

      <H2 id="machine">What the machine needs</H2>
      <UL>
        <LI>
          <Strong>Python 3.10 or newer</Strong>, and network access to install the engine and
          download the checkpoint.
        </LI>
        <LI>
          <Strong>OpenGL with EGL.</Strong> The ALOHA environments render camera images with
          MuJoCo. On Linux the engine sets <C>MUJOCO_GL=egl</C> unless the variable is already
          set, so the machine needs a working EGL implementation. No display server is needed.
        </LI>
        <LI>
          <Strong>A GPU, if you want reasonable run times.</Strong> Both rendering and policy
          inference are much faster on a GPU. A hosted runner without one falls back to CPU
          inference and, where the EGL implementation provides it, software rendering.
        </LI>
      </UL>
      <Callout kind="warning" title="Standard hosted runners are slow for this">
        <p>
          The example suite is 19 conditions of 50 episodes, which is 950 episodes of up to
          400 steps, each step rendering a 480 by 640 image and possibly running inference.
          On a CPU-only runner this can exceed the job time limit. Use a GPU runner or a
          self-hosted machine for full suites, and keep CPU runners for smoke tests. Run
          times depend on the policy and the hardware. Measure a short run on your own runner
          first.
        </p>
      </Callout>
      <P>
        If EGL cannot initialize on a machine without a GPU, MuJoCo also has a software
        renderer: set <C>MUJOCO_GL=osmesa</C> and install the OSMesa library
        (<C>libosmesa6</C> on Ubuntu). The engine respects a value of <C>MUJOCO_GL</C> that is
        already set. We have not tested Shakedown on every hosted runner image, so treat the
        package list in the workflow below as a starting point.
      </P>
      <P>
        Compare runs from the same type of machine. Rendering differs between GPUs and drivers,
        and those differences can change episode outcomes. See{" "}
        <A href="/docs/limitations#rendering">Limitations</A>.
      </P>

      <H3 id="measured">One measured run time</H3>
      <P>
        This is a single data point from one machine, not a benchmark. The example suite, 19
        conditions of 50 episodes, 950 episodes in total, was run with{" "}
        <C>--workers 8</C> on a laptop with an Apple M4 Max, with inference on MPS, for the
        ACT checkpoint of the quickstart.
      </P>
      <DocTable
        caption="Measured run time of the example suite on one Apple M4 Max laptop with 8 workers"
        head={["Inference setting", "Model is called", "Run time"]}
        monoFirst={false}
        numeric={[2]}
        rows={[
          ["Checkpoint default", "every 100 steps", "29 min"],
          [<C key="a">n_action_steps=50</C>, "every 50 steps", "54 min"],
          [<C key="a">n_action_steps=25</C>, "every 25 steps", "45 min"],
          [<C key="a">temporal_ensemble_coeff=0.01</C>, "every step", "69 min"],
        ]}
      />
      <P>
        Settings that call the model more often took longer than the default, though not in
        strict order: the run at 50 steps took longer than the run at 25. We have no
        measurement on Linux, on a hosted CI runner or on a CUDA GPU.
      </P>

      <H2 id="exit-codes">Exit codes</H2>
      <DocTable
        caption="Exit codes of shakedown run and shakedown compare"
        head={["Code", "Run verdict", "Meaning"]}
        numeric={[0]}
        rows={[
          [
            "0",
            "PASS, WARN or SKIP",
            "No condition failed. WARN exits 0 unless --fail-on warn is given.",
          ],
          [
            "1",
            "FAIL",
            "At least one condition failed. Also WARN, with --fail-on warn.",
          ],
          [
            "2",
            "ERROR",
            "At least one episode raised an exception, or a scene could not be built. Code 2 is also used when the command cannot run at all.",
          ],
        ]}
      />
      <P>
        The run verdict is the most severe condition verdict, so an ERROR in one condition
        gives exit code 2 even when another condition is a FAIL.
      </P>
      <P>Code 2 without a result means the command stopped early. Causes include:</P>
      <UL>
        <LI>a missing or malformed scenario file, or an unknown environment,</LI>
        <LI>
          a condition anywhere in the suite whose scene cannot be built: an unsupported
          perturbation, a camera name that does not exist, a missing scanned scene, or
          distractors that cannot be placed. Every problem found is listed,
        </LI>
        <LI>
          <C>--workers</C> above 1 with a served policy,
        </LI>
        <LI>a policy that cannot be loaded, or a policy server that cannot be reached,</LI>
        <LI>
          <C>--upload</C> without <C>SHAKEDOWN_URL</C> or <C>SHAKEDOWN_API_KEY</C>, or a server
          that rejects the key,
        </LI>
        <LI>a baseline file that cannot be read,</LI>
        <LI>an invalid value for an option.</LI>
      </UL>
      <P>
        All of these stop the command before any episode runs. The suite is checked first,
        before the policy is loaded, so a job with a broken suite fails quickly.
      </P>
      <P>
        <C>shakedown validate</C> makes the same check of the suite on its own. It exits 0
        when every file is valid, 1 when it found a problem in a condition, and 2 when a file
        cannot be parsed or fails the schema. It builds scenes, so it needs the same rendering
        support as a run.
      </P>

      <H3 id="fail-on">Failing on warnings</H3>
      <P>
        By default a WARN does not fail the job. It means the episode count could not settle
        the question, and failing on it would make the job fail by chance. Pass{" "}
        <C>--fail-on warn</C> to exit 1 on WARN as well, for example on a release branch where
        an unresolved warning should block.
      </P>
      <CodeBlock
        lang="shell"
        code={`shakedown run scenarios --policy "lerobot:$POLICY_CHECKPOINT" --baseline runs/main --fail-on warn`}
      />

      <H2 id="reports">Reports</H2>
      <P>
        The terminal table is always printed. The report files are written in addition, after
        the run has finished, whatever the verdict.
      </P>

      <H3 id="junit">JUnit XML</H3>
      <P>
        <C>--junit &lt;path&gt;</C> writes one test suite with one test case per condition.
        Parent directories are created.
      </P>
      <DocTable
        caption="How verdicts map to JUnit"
        head={["Condition verdict", "JUnit test case"]}
        rows={[
          ["PASS", "Passed."],
          ["WARN", "Passed. The warning is visible in system-out only."],
          ["FAIL", "A failure element, with the message of the most severe check."],
          ["ERROR", "An error element, with the exception message."],
          ["SKIP", "A skipped element."],
        ]}
      />
      <P>
        Every test case carries the success rate, the episode count, the interval and the
        message of every check in <C>system-out</C>. The values below are illustrative.
      </P>
      <CodeBlock filename="Example output: reports/shakedown.xml" code={junit} />

      <H3 id="markdown">Markdown summary</H3>
      <P>
        <C>--markdown &lt;path&gt;</C> writes a summary meant for a pull request comment: a
        heading with the run verdict, the policy label and its baseline, the number of
        regressions found, and a table with the same columns as the terminal report. When the
        run was uploaded, it ends with a link to the run in the dashboard. Posting the file as
        a comment is left to your CI system. Verdicts are written as words. The values below
        are illustrative.
      </P>
      <CodeBlock filename="Example output: reports/shakedown.md" code={markdownOut} />

      <H3 id="job-summary">GitHub job summary</H3>
      <P>
        When the environment variable <C>GITHUB_STEP_SUMMARY</C> is set, which GitHub Actions
        does for every step, <C>shakedown run</C> appends the same Markdown summary to that
        file. The summary then appears on the job’s page. This needs no option and cannot be
        turned off from the command line.
      </P>

      <H2 id="baselines">Baselines in CI</H2>
      <P>
        A regression check needs the result of an earlier run of the same suite. There are two
        ways to supply it. If you pass both, <C>--baseline</C> wins.
      </P>

      <H3 id="baseline-branch">From the server</H3>
      <P>
        With <C>--upload --baseline-branch main</C>, the CLI asks the server for the latest
        completed run of the same suite on branch <C>main</C>, in the project the API key
        belongs to, and uses it as the baseline.
      </P>
      <UL>
        <LI>
          The suite is matched by name. The name is the directory you pass to{" "}
          <C>shakedown run</C>, so run the same path in every job.
        </LI>
        <LI>
          The branch of a run is taken from <C>GITHUB_HEAD_REF</C>, then{" "}
          <C>GITHUB_REF_NAME</C>, then the local git checkout. Runs on <C>main</C> therefore
          become baselines without further configuration, as the workflow below does with its{" "}
          <C>push</C> trigger.
        </LI>
        <LI>
          When the branch has no completed run yet, the CLI prints a notice and runs without a
          baseline. The first run on <C>main</C> is that case.
        </LI>
        <LI>
          <C>--baseline-branch</C> without <C>--upload</C> is ignored.
        </LI>
      </UL>

      <H3 id="baseline-file">From a file</H3>
      <P>
        Without a server, keep the <C>result.json</C> of the baseline run and pass it with{" "}
        <C>--baseline</C>. How the file travels between jobs, as a build artifact or in object
        storage, is up to you.
      </P>
      <CodeBlock lang="shell" code={baselineFile} />

      <H2 id="secrets">Required secrets</H2>
      <P>
        Uploads need secrets, and so does a served policy that requires a token. A run of an
        in-process policy without <C>--upload</C> needs none.
      </P>
      <DocTable
        caption="Environment variables read by the CLI"
        head={["Variable", "Required for", "Meaning"]}
        rows={[
          [
            "SHAKEDOWN_URL",
            "--upload",
            "Base URL of your Shakedown server. There is no default. Same as --url.",
          ],
          [
            "SHAKEDOWN_API_KEY",
            "--upload",
            "A project API key. Same as --api-key. Prefer the variable, so the key does not appear in the process list or the job log.",
          ],
          [
            "SHAKEDOWN_POLICY_TOKEN",
            "a served policy that requires a token",
            "Bearer token sent to the policy server. Same as --policy-token.",
          ],
          [
            "GITHUB_STEP_SUMMARY",
            "optional",
            "Set by GitHub Actions. The Markdown summary is appended to this file.",
          ],
          [
            "GITHUB_SHA, GITHUB_HEAD_REF, GITHUB_REF_NAME, GITHUB_REF, GITHUB_REPOSITORY",
            "optional",
            "Set by GitHub Actions. Used for the commit, branch, pull request number and repository stored with the run. Outside GitHub the commit and branch are read from the local git checkout.",
          ],
          [
            "MUJOCO_GL",
            "optional",
            "MuJoCo rendering backend. Defaults to egl on Linux and glfw on macOS.",
          ],
          [
            "SHAKEDOWN_CACHE",
            "optional",
            "Root directory for migrated checkpoints. Defaults to ~/.cache/shakedown.",
          ],
        ]}
      />
      <P>
        Store the URL and the key as secrets of the repository or the organization. API keys
        are described in <A href="/docs/dashboard#api-keys">Dashboard</A>.
      </P>
      <Callout title="Pull requests from forks">
        <p>
          GitHub does not pass secrets to workflows triggered by pull requests from forks.
          With the variables empty, <C>--upload</C> stops the command with exit code 2 before
          any episode runs.
        </p>
      </Callout>

      <H2 id="workflow">Complete workflow</H2>
      <P>
        The workflow runs the example suite on every pull request and on every push to{" "}
        <C>main</C>. It assumes your repository contains the scenario files under{" "}
        <C>scenarios/aloha-transfer-cube</C>. Define two repository variables:{" "}
        <C>SHAKEDOWN_REPO</C>, the URL of the Shakedown repository, and{" "}
        <C>POLICY_CHECKPOINT</C>, the checkpoint to test.
      </P>
      <CodeTabs
        tabs={[
          {
            label: "GitHub Actions",
            content: (
              <CodeBlock
                bare
                lang="yaml"
                filename=".github/workflows/policy-regression.yml"
                code={workflow}
              />
            ),
          },
          {
            label: "Shell",
            content: <CodeBlock bare lang="shell" filename="ci/shakedown.sh" code={shell} />,
          },
        ]}
      />
      <P>Notes on the workflow:</P>
      <UL>
        <LI>
          The job fails on the <C>Run suite</C> step when the exit code is not 0. The{" "}
          <C>Keep results</C> step runs anyway, so the videos of the failures are available.
        </LI>
        <LI>
          The label is the short commit SHA. Any string works. It is the name the checkpoint
          has in reports and in the dashboard.
        </LI>
        <LI>
          <C>--no-progress</C> hides the progress bars, which do not render usefully in a job
          log.
        </LI>
        <LI>
          The run directory holds videos and can be large. Use <C>--videos none</C> if you only
          need verdicts.
        </LI>
        <LI>
          If your checkpoint is a private Hub repository, the job also needs a Hugging Face
          token, which the Hugging Face libraries read from <C>HF_TOKEN</C>.
        </LI>
      </UL>

      <H2 id="time">Keeping run time down</H2>
      <UL>
        <LI>
          <Strong>Run a smoke test first.</Strong> A few episodes per condition show that the
          simulator renders and the policy loads before you spend time on the full suite.
        </LI>
        <LI>
          <Strong>Use several workers.</Strong> <C>--workers N</C> spreads the perturbed
          conditions across N processes. Each process loads its own copy of the policy, so N is
          limited by memory, and on a GPU by GPU memory. Unperturbed conditions always run
          first, in the main process. Workers cannot be used with a served policy.
        </LI>
        <LI>
          <Strong>Do not sweep settings on every pull request.</Strong>{" "}
          <C>shakedown tune</C> costs one full run per setting. Run it when the checkpoint or
          the deployment changes, and gate pull requests on one setting.
        </LI>
        <LI>
          <Strong>Split the suite by cost.</Strong> Run a small suite on every pull request and
          the full suite on <C>main</C> or nightly. Each directory is its own suite with its
          own baselines.
        </LI>
      </UL>
      <CodeBlock lang="shell" filename="Smoke test" code={smoke} />
      <Callout kind="warning" title="--episodes changes what is compared">
        <p>
          A run with <C>--episodes</C> has a different fingerprint than a run without it. If
          the job on <C>main</C> and the job on pull requests use different episode counts,
          every comparison between them is unpaired. Use the same command in both.
        </p>
      </Callout>
    </DocPage>
  );
}
