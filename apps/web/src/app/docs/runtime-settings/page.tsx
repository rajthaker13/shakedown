import { CodeBlock } from "@/components/docs/code-block";
import { DocPage } from "@/components/docs/doc-page";
import { pageMetadata } from "@/components/docs/nav";
import { A, C, Callout, H2, H3, LI, OL, P, Strong, UL } from "@/components/docs/prose";
import { DocTable } from "@/components/docs/table";
import type { TocItem } from "@/components/docs/toc";

const href = "/docs/runtime-settings";

export const metadata = pageMetadata(href);

const toc: TocItem[] = [
  { id: "what", title: "What is deployed" },
  { id: "settings", title: "The settings" },
  { id: "delay", title: "Delay and compensation" },
  { id: "uncompensated", title: "What results under delay describe", level: 3 },
  { id: "latency-compensation", title: "latency_compensation", level: 3 },
  { id: "tune", title: "Sweeping settings with tune" },
  { id: "recommend", title: "How recommend chooses" },
  { id: "noise", title: "Why not take the top of the table", level: 3 },
  { id: "tolerance", title: "Tolerance statements" },
  { id: "real-result", title: "A real result" },
  { id: "reading", title: "Reading it", level: 3 },
  { id: "limits", title: "Limits" },
];

const specs = `# As published
--policy lerobot:lerobot/act_aloha_sim_transfer_cube_human

# Execute 50 actions of each plan, then plan again
--policy "lerobot:lerobot/act_aloha_sim_transfer_cube_human?n_action_steps=50"

# The same, skipping the actions that a known delay makes stale
--policy "lerobot:lerobot/act_aloha_sim_transfer_cube_human?n_action_steps=50&latency_compensation=auto"`;

const tuneCmd = `shakedown tune scenarios/aloha-transfer-cube \\
  --policy lerobot:lerobot/act_aloha_sim_transfer_cube_human \\
  --sweep n_action_steps=25,50 \\
  --out runs/tune \\
  --workers 8`;

const tuneTwo = `shakedown tune scenarios/aloha-latency \\
  --policy lerobot:lerobot/act_aloha_sim_transfer_cube_human \\
  --sweep n_action_steps=25,50 \\
  --sweep latency_compensation=0,auto`;

const tuneTree = `runs/tune/
├── published/                    # the policy exactly as given
├── n_action_steps=25/
├── n_action_steps=50/
└── recommendation.json           # the choice, as shakedown recommend --json prints it`;

const recommendCmd = `shakedown recommend \\
  runs/act-chunk100 runs/act-chunk50 runs/act-chunk25 runs/act-ensemble \\
  --default act-chunk100`;

const recommendOut = `Runtime settings
┏━━━┳━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━┓
┃   ┃ Setting      ┃      Success ┃ 95% interval ┃              Worst condition ┃ p against best ┃
┡━━━╇━━━━━━━━━━━━━━╇━━━━━━━━━━━━━━╇━━━━━━━━━━━━━━╇━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━━━━━━┩
│ → │ act-chunk50  │ 72%  683/950 │      69%–75% │   40%  sensor-noise · std=20 │              – │
│   │ act-ensemble │ 68%  647/950 │      65%–71% │             44%  distractors │        0.028 * │
│   │ act-chunk100 │ 68%  644/950 │      65%–71% │   30%  sensor-noise · std=20 │        0.022 * │
│   │ act-chunk25  │ 58%  550/950 │      55%–61% │ 8%  action-latency · steps=5 │        0.000 * │
└───┴──────────────┴──────────────┴──────────────┴──────────────────────────────┴────────────────┘
* clearly worse than the best setting

Use act-chunk50  lerobot:engine/checkpoints/act_aloha_sim_transfer_cube_human?n_action_steps=50
act-chunk50 succeeds in 72% of episodes across all conditions and is clearly better than every other setting
tested.
  lighting-dim: no clear drop up to level=0.4, the last value tested
  camera-pan: no clear drop up to pan=4, the last value tested
  camera-shift: no clear drop up to dx=3, the last value tested
  object-position: holds up to dy=3; drops to 52% at dy=6 (from 74%)
  sensor-noise: holds up to std=8; drops to 40% at std=20 (from 74%)
  action-latency: no clear drop up to steps=5, the last value tested`;

export default function RuntimeSettingsPage() {
  return (
    <DocPage
      href={href}
      toc={toc}
      lead="What runs on a robot is a checkpoint together with its runtime settings: how many actions are executed per plan, whether delay is compensated, whether plans are ensembled. The settings change behavior, and they are usually left at whatever the checkpoint was published with."
    >
      <H2 id="what">What is deployed</H2>
      <P>
        A policy that predicts a chunk of actions does not run the network at every control
        step. It plans, executes some of the plan, and plans again. How much of each plan it
        executes is not a property of the weights. It is a setting chosen at deployment, and
        the same weights behave differently under different values of it, especially when
        actions arrive late or observations are noisy.
      </P>
      <P>
        Shakedown treats the settings as part of the thing under test. They are written into
        the policy spec, so they are stored with every run, and a{" "}
        <A href="/docs/releases">release</A> pins the checkpoint and the settings together.
      </P>
      <CodeBlock lang="shell" code={specs} />

      <H2 id="settings">The settings</H2>
      <DocTable
        caption="Runtime settings of a LeRobot policy"
        head={["Setting", "Value", "What it changes"]}
        rows={[
          [
            "n_action_steps",
            "integer",
            "Actions executed from each plan before the policy looks again. Lower values react sooner and call the model more often.",
          ],
          [
            "temporal_ensemble_coeff",
            "number",
            "ACT temporal ensembling: the policy plans at every step and averages overlapping plans. Setting it forces n_action_steps to 1.",
          ],
          [
            "latency_compensation",
            "integer or auto",
            "Skip the first actions of each new plan, which a known delay has made stale. See below.",
          ],
        ]}
      />
      <P>
        These three are what a release records as its runtime settings. The other options of
        a policy spec, <C>num_inference_steps</C>, <C>n_obs_steps</C> and <C>dtype</C>, can be
        swept in the same way. All of them are described in{" "}
        <A href="/docs/policies#options">Policies</A>.
      </P>

      <H2 id="delay">Delay and compensation</H2>
      <P>
        The <A href="/docs/perturbations#action_latency">action_latency</A> perturbation
        delays actions in a simple queue: an action the policy chooses at step <C>t</C> reaches
        the robot at step <C>t + steps</C>. The policy keeps receiving fresh observations.
      </P>

      <H3 id="uncompensated">What results under delay describe</H3>
      <Callout kind="warning" title="Without compensation, the test describes an uncompensated deployment">
        <p>
          When a policy plans again under delay, the observation it plans from does not yet
          reflect the actions it has already sent and that are still in the queue. The first
          actions of the new plan are computed for a moment that will have passed by the
          time they arrive. Real deployments usually correct for this.
        </p>
        <p>
          Without <C>latency_compensation</C>, Shakedown does not. Results under{" "}
          <C>action_latency</C> then describe a deployment that makes no correction for its
          delay. They are not a statement about what the same checkpoint does in a
          deployment that compensates.
        </p>
      </Callout>
      <P>
        A control experiment comparing compensated and uncompensated settings is in progress.
        Its results are not in these docs yet, and this page draws no conclusion about how
        much compensation changes the outcome.
      </P>

      <H3 id="latency-compensation" mono>
        latency_compensation
      </H3>
      <P>
        With compensation, each time the policy makes a new plan, the first actions of that
        plan are skipped, because they would arrive after their moment has passed.
      </P>
      <DocTable
        caption="Values of latency_compensation"
        head={["Value", "Effect"]}
        rows={[
          ["0 or not set", "No compensation. This is the default."],
          [
            "a whole number",
            "Skip that many actions of each new plan, in every condition, whether or not the condition has a delay.",
          ],
          [
            "auto",
            "Skip as many actions as the condition delays. The runner tells the policy the delay of each condition before it starts: the sum of the steps of its action_latency perturbations. In a condition without delay nothing is skipped.",
          ],
        ]}
      />
      <UL>
        <LI>
          The number of skipped actions must be lower than the number executed per plan. If
          it is not, the run stops with an error: there would be nothing left to execute.
        </LI>
        <LI>
          Compensation acts on the policy’s queue of planned actions, so it has an effect
          only for policy types that keep such a queue. With temporal ensembling one action
          is executed per plan, so any compensation of 1 step or more is refused with the
          error above.
        </LI>
        <LI>
          The check is made when a condition starts, not before the run. With{" "}
          <C>auto</C>, a run can therefore stop part-way, at the first condition whose delay
          is not lower than the number of actions per plan.
        </LI>
        <LI>
          <C>auto</C> works for policies that run in-process. A{" "}
          <A href="/docs/policies#http">served policy</A> is not told the delay, so it has to
          compensate on its own side.
        </LI>
        <LI>
          On a real robot the delay is something you measure. <C>auto</C> is a convenience of
          the simulator, which knows the delay it imposes. A release should record the
          number you measured.
        </LI>
      </UL>

      <H2 id="tune">Sweeping settings with tune</H2>
      <P>
        <C>shakedown tune</C> runs a suite once per setting and then chooses one. Each{" "}
        <C>--sweep</C> names a setting and the values to try.
      </P>
      <CodeBlock lang="shell" code={tuneCmd} />
      <UL>
        <LI>
          <Strong>The policy as given is always included</Strong>, under the label{" "}
          <C>published</C>. It is the default to beat. The example runs three settings:{" "}
          <C>published</C>, <C>n_action_steps=25</C> and <C>n_action_steps=50</C>.
        </LI>
        <LI>
          Several <C>--sweep</C> options are combined. Two settings of two values each give
          four combinations, plus <C>published</C>.
        </LI>
        <LI>
          Each setting runs as its own <C>shakedown run</C> process, without videos, so
          nothing carries over between settings. Every setting runs the same scenarios on
          the same seeds.
        </LI>
        <LI>
          A full sweep costs one full run per setting. Use <C>--episodes</C> for a first
          look, and the full episode count before you act on the result.
        </LI>
        <LI>
          A setting whose run cannot start stops the sweep with exit code 2. A setting whose
          run ends in FAIL is a result like any other.
        </LI>
      </UL>
      <CodeBlock lang="shell" filename="Two settings combined" code={tuneTwo} />
      <CodeBlock filename="Output directory" code={tuneTree} />
      <P>
        To choose between runs you already have, use <C>shakedown recommend</C>. It takes two
        or more run directories or result files. <C>--default</C> names the label of the run
        made with the published settings.
      </P>

      <H2 id="recommend">How recommend chooses</H2>
      <P>The rule is fixed and short. It is implemented in <C>engine/src/shakedown/tune.py</C>.</P>
      <OL>
        <LI>
          <Strong>Pool.</Strong> For each setting, count successes over every episode of
          every condition. The success rate is that count over the number of episodes.
        </LI>
        <LI>
          <Strong>Rank.</Strong> Order the settings by pooled success rate. Ties are broken
          by the better worst case, then by label.
        </LI>
        <LI>
          <Strong>Test each setting against the best.</Strong> The test is the exact McNemar
          test over all episodes the two settings share: the same condition, with the same
          fingerprint, on the same seed. A setting with p below 0.05 is clearly worse than
          the best. The others are indistinguishable from it.
        </LI>
        <LI>
          <Strong>Choose.</Strong>
        </LI>
      </OL>
      <DocTable
        caption="How the setting is chosen"
        head={["Situation", "Choice"]}
        monoFirst={false}
        rows={[
          ["Every other setting is clearly worse than the best", "The best."],
          [
            "Several settings are indistinguishable, and the published default is among them",
            "The published default. There is no evidence for changing it.",
          ],
          [
            "Several settings are indistinguishable, and the published default is not among them, or none was named",
            "Of those, the one with the best worst case: the highest success rate in its weakest condition. Ties are broken by pooled rate.",
          ],
        ]}
      />
      <P>
        The worst case of a setting is its lowest success rate over the conditions of the
        suite, with the condition where it occurred.
      </P>

      <H3 id="noise">Why not take the top of the table</H3>
      <P>
        Some setting is always at the top. When the settings below it cannot be told apart
        from it, its position is an accident of the seeds, and another set of seeds would
        put a different one there. Picking the top of a set of indistinguishable results is
        choosing noise. Deploying it would change a working configuration for no measured
        gain, and the next sweep might change it back.
      </P>
      <P>
        So the published default wins ties. It is the setting the checkpoint’s authors
        evaluated, and keeping it costs nothing. When the default is already clearly worse,
        the tie is broken by the worst case and not by the pooled rate, because a robot meets
        its worst condition sooner or later.
      </P>

      <H2 id="tolerance">Tolerance statements</H2>
      <P>
        For the chosen setting, <C>recommend</C> prints one line per sweep of the suite,
        saying how far along the sweep success holds.
      </P>
      <UL>
        <LI>
          The reference is the unperturbed condition of the run. Without one, no statements
          are printed.
        </LI>
        <LI>
          Only sweeps over numbers are reported. The conditions of a sweep are taken{" "}
          <Strong>in the order the scenario lists them</Strong>, which is the author’s order
          of severity. They are not sorted by value: for a light level, a lower value is the
          harsher one.
        </LI>
        <LI>
          Each condition is compared with the reference on their shared seeds, with the
          exact McNemar test. A drop counts when it <Strong>exceeds 10 points and has p
          below 0.05</Strong>.
        </LI>
        <LI>
          The walk stops at the first condition that drops. The statement names the last
          value that held and the value where it dropped.
        </LI>
      </UL>
      <DocTable
        caption="Forms of a tolerance statement"
        head={["Statement", "Meaning"]}
        monoFirst={false}
        rows={[
          [
            "no clear drop up to level=0.4, the last value tested",
            "No condition of the sweep dropped. The sweep did not reach the limit of the policy.",
          ],
          [
            "holds up to dy=3; drops to 52% at dy=6 (from 74%)",
            "The limit lies between the two values.",
          ],
          ["does not hold; drops to …", "The first value of the sweep already dropped."],
        ]}
      />
      <P>
        “No clear drop” is not “no drop”. With 50 episodes per condition, a condition can
        lose 10 points without the test reaching p below 0.05. See{" "}
        <A href="/docs/statistics#how-many-episodes">how many episodes to run</A>.
      </P>

      <H2 id="real-result">A real result</H2>
      <Callout title="One public checkpoint, in simulation">
        <p>
          The output below is real, not illustrative. It comes from four runs of the public
          ACT checkpoint <C>lerobot/act_aloha_sim_transfer_cube_human</C> on the example
          suite, 19 conditions of 50 episodes each, on one machine. It is a result about
          that checkpoint in that simulator. It is not advice for another policy, and it
          has not been checked on a real robot.
        </p>
      </Callout>
      <CodeBlock lang="shell" code={recommendCmd} />
      <CodeBlock filename="Output" code={recommendOut} />
      <DocTable
        caption="The four settings that were compared"
        head={["Label", "Setting"]}
        rows={[
          ["act-chunk100", "As published: 100 actions per plan."],
          ["act-chunk50", <C key="s">n_action_steps=50</C>],
          ["act-chunk25", <C key="s">n_action_steps=25</C>],
          ["act-ensemble", <C key="s">temporal_ensemble_coeff=0.01</C>],
        ]}
      />

      <H3 id="reading">Reading it</H3>
      <UL>
        <LI>
          The arrow marks the chosen setting. Every other setting is marked with an
          asterisk, so the choice was clear and the published default, which was named with{" "}
          <C>--default</C>, did not get to win a tie.
        </LI>
        <LI>
          The margins are not large. Two of the three p-values are 0.028 and 0.022, below
          0.05 but not far below. Three comparisons were made and no correction was applied
          for that.
        </LI>
        <LI>
          The suite contains two conditions with action delay, and none of the four runs
          used <C>latency_compensation</C>. The pooled rates therefore include{" "}
          <A href="#uncompensated">uncompensated delay</A>. The worst condition of{" "}
          <C>act-chunk25</C>, 8% under a delay of 5 steps, is such a condition.
        </LI>
        <LI>
          The reference rate in the tolerance statements, 74%, is the unperturbed rate of
          the chosen setting, not of the published one.
        </LI>
      </UL>

      <H2 id="limits">Limits</H2>
      <UL>
        <LI>
          <Strong>The choice is relative to the suite.</Strong> Pooling gives every episode
          the same weight, so a suite with many vision conditions and few timing conditions
          weighs vision more. If the conditions of your deployment are not the conditions
          of the suite, neither is the best setting.
        </LI>
        <LI>
          <Strong>No correction for the number of settings.</Strong> Each setting is tested
          against the best at p below 0.05. The more settings you sweep, the more likely it
          is that one of them looks clearly worse, or that the best looks clearly best, by
          chance.
        </LI>
        <LI>
          <Strong>The best is chosen and tested on the same episodes.</Strong> The rate of
          the chosen setting is an optimistic estimate. Confirm it with a run on other
          seeds before you rely on the number.
        </LI>
        <LI>
          <Strong>Run time is not considered.</Strong> A setting that calls the model more
          often costs more compute on the robot. <C>recommend</C> looks at success only.
        </LI>
        <LI>
          <Strong>Simulation only.</Strong> Nothing on this page has been validated on a
          physical robot. See <A href="/docs/limitations">Limitations</A>.
        </LI>
      </UL>
    </DocPage>
  );
}
