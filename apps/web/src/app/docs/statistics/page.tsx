import { CodeBlock } from "@/components/docs/code-block";
import { DocPage } from "@/components/docs/doc-page";
import { pageMetadata } from "@/components/docs/nav";
import { A, C, Callout, H2, H3, LI, OL, P, Strong, UL } from "@/components/docs/prose";
import { DocTable } from "@/components/docs/table";
import type { TocItem } from "@/components/docs/toc";

const href = "/docs/statistics";

export const metadata = pageMetadata(href);

const toc: TocItem[] = [
  { id: "principle", title: "The principle" },
  { id: "wilson", title: "The Wilson interval" },
  { id: "warn-or-fail", title: "WARN or FAIL on a low rate" },
  { id: "mcnemar", title: "Paired comparison: exact McNemar" },
  { id: "fisher", title: "Unpaired comparison: Fisher" },
  { id: "regression-rule", title: "The regression rule" },
  { id: "how-many-episodes", title: "How many episodes to run" },
  { id: "absolute", title: "For a success rate", level: 3 },
  { id: "paired", title: "For a regression", level: 3 },
  { id: "practice", title: "In practice", level: 3 },
  { id: "first-divergence", title: "First-divergence detection" },
  { id: "divergence-measure", title: "What it measures", level: 3 },
  { id: "divergence-thresholds", title: "Thresholds", level: 3 },
  { id: "divergence-reading", title: "How to read it", level: 3 },
];

const wilson = `z      = 1.96 for 95% confidence
p      = successes / n
center = (p + z² / 2n) / (1 + z² / n)
half   = z · sqrt(p(1 − p) / n + z² / 4n²) / (1 + z² / n)

interval = [center − half, center + half]`;

const mcnemar = `regressed = seeds the baseline solved and the candidate did not
improved  = seeds the candidate solved and the baseline did not
d         = regressed + improved

p = min(1, 2 · P(X ≤ min(regressed, improved)))   where X ~ Binomial(d, 0.5)`;

const needed = `n = ceil(z² · p(1 − p) / margin²)`;

const python = `from shakedown.stats import episodes_needed, wilson_interval

episodes_needed(0.8, 0.05)        # 246
wilson_interval(40, 50)           # (0.669..., 0.887...)`;

const divergence = `range[j]  = max(0.05, max over t of nominal[t, j] − min over t of nominal[t, j])
            # t runs over the whole nominal episode
d[t]      = max over j of |perturbed[t, j] − nominal[t, j]| / range[j]

first divergent step = first t where d[t] > 0.15 for 5 consecutive steps`;

export default function StatisticsPage() {
  return (
    <DocPage
      href={href}
      toc={toc}
      lead="Success rates from a few dozen episodes are noisy. Every verdict is backed by an interval or a test, so that a run does not report a regression that cannot be told apart from sampling noise."
    >
      <H2 id="principle">The principle</H2>
      <P>
        An episode either succeeds or fails, so the success rate of a condition is a binomial
        proportion. At 50 episodes, a policy whose true success rate is 80% will often score
        anywhere from 70% to 90%. A rule that fails a condition whenever the observed rate
        falls below a threshold would fail by chance, and a test that fails by chance gets
        ignored.
      </P>
      <P>Shakedown therefore separates three outcomes for every check:</P>
      <UL>
        <LI>
          <Strong>PASS.</Strong> The observed result meets the requirement.
        </LI>
        <LI>
          <Strong>FAIL.</Strong> The observed result misses the requirement, and the evidence
          is statistically clear.
        </LI>
        <LI>
          <Strong>WARN.</Strong> The observed result misses the requirement, but the episode
          count cannot separate that from noise.
        </LI>
      </UL>
      <P>
        The statistics are implemented in <C>engine/src/shakedown/stats.py</C> and the rules
        in <C>engine/src/shakedown/verdict.py</C>, with no dependencies outside the Python
        standard library.
      </P>

      <H2 id="wilson">The Wilson interval</H2>
      <P>
        Every success rate is reported with a 95% Wilson score interval. The Wilson interval is
        used in place of the usual normal approximation because it stays inside 0 to 1 and
        behaves sensibly at 0 of n and n of n, which is where policy evaluations often sit.
      </P>
      <CodeBlock filename="Wilson score interval" code={wilson} />
      <P>
        The lower bound is set to exactly 0 at 0 successes, and the upper bound to exactly 1 at
        n successes. The width depends mostly on the number of episodes. For an observed rate
        of 80%:
      </P>
      <DocTable
        caption="95% Wilson interval for an observed success rate of 80%"
        head={["Episodes", "Successes", "95% interval"]}
        numeric={[0, 1, 2]}
        monoFirst={false}
        rows={[
          ["10", "8", "49% to 94%"],
          ["20", "16", "58% to 92%"],
          ["50", "40", "67% to 89%"],
          ["100", "80", "71% to 87%"],
          ["200", "160", "74% to 85%"],
          ["500", "400", "76% to 83%"],
        ]}
      />
      <P>
        The report table and the <C>success_rate</C> check always use 95%. The functions in{" "}
        <C>stats.py</C> accept confidence levels of 0.80, 0.90, 0.95 and 0.99.
      </P>

      <H2 id="warn-or-fail">WARN or FAIL on a low rate</H2>
      <P>
        The <C>success_rate</C> assertion compares the observed rate and the interval with the
        minimum:
      </P>
      <DocTable
        caption="How the success_rate check is decided"
        head={["Verdict", "Observed rate", "Upper bound of the interval"]}
        rows={[
          ["PASS", "at or above the minimum", "not used"],
          ["WARN", "below the minimum", "at or above the minimum"],
          ["FAIL", "below the minimum", "below the minimum"],
        ]}
      />
      <P>Against a minimum of 60% with 50 episodes:</P>
      <UL>
        <LI>
          27 of 50 is 54%, with an interval of 40% to 67%. The true rate could still be 60%.
          The check is WARN.
        </LI>
        <LI>
          12 of 50 is 24%, with an interval of 14% to 37%. The true rate is below 60% with high
          confidence. The check is FAIL.
        </LI>
      </UL>
      <P>
        A WARN message ends with advice. Shakedown estimates how many episodes would settle the
        question: the number that gives an interval with a half-width of half the gap between
        the observed rate and the minimum, and never less than 1 percentage point.
      </P>
      <UL>
        <LI>
          Up to 1000 episodes, the message states the number, for example “About 267 episodes
          would settle it” for 24 of 50 against a minimum of 60%.
        </LI>
        <LI>
          Above 1000, the message says that the rate is too close to the minimum to separate
          with a practical number of episodes. 27 of 50 against 60% is that case. Running more
          episodes is then not the answer: decide whether the minimum is the right one.
        </LI>
      </UL>
      <P>
        The estimate is stored with the check in <C>result.json</C> as{" "}
        <C>episodes_needed</C> in both cases.
      </P>
      <Callout title="PASS is not symmetric with FAIL">
        <p>
          A check passes as soon as the observed rate meets the minimum, even when the
          interval extends below it. The rule is built to avoid false failures, not to certify
          the true rate. If you need confidence that the true rate is above a value, set the
          minimum higher than that value, or run more episodes and read the lower bound.
        </p>
      </Callout>

      <H2 id="mcnemar">Paired comparison: exact McNemar</H2>
      <P>
        When the candidate and the baseline ran the same condition on the same seeds, each seed
        gives a pair of outcomes. Most pairs agree: both checkpoints solve the seed, or both
        fail it. Those pairs say nothing about which checkpoint is better. Only the discordant
        pairs do.
      </P>
      <P>
        If the two checkpoints were equally good, a discordant seed would be as likely to go
        one way as the other. The exact McNemar test asks how surprising the observed split is
        under that assumption, using the binomial distribution directly. It needs no
        large-sample approximation, so it is valid for the small counts a test suite produces.
      </P>
      <CodeBlock filename="Exact McNemar test, two-sided" code={mcnemar} />
      <DocTable
        caption="p-values of the exact McNemar test for some splits of discordant seeds"
        head={["Regressed", "Improved", "p-value"]}
        numeric={[0, 1, 2]}
        monoFirst={false}
        rows={[
          ["3", "0", "0.250"],
          ["5", "0", "0.063"],
          ["6", "0", "0.031"],
          ["8", "1", "0.039"],
          ["9", "2", "0.065"],
          ["12", "4", "0.077"],
        ]}
      />
      <P>
        The table shows the floor of the test. With fewer than 6 discordant seeds, no split
        reaches p below 0.05. Five regressions and no improvements is a WARN, never a FAIL, at
        the default confidence.
      </P>
      <P>
        A comparison is paired when the two conditions have the same{" "}
        <A href="/docs/scenarios#fingerprint">fingerprint</A> and outcomes for exactly the same
        seeds. The result records the number of regressed and improved seeds, and the
        per-seed outcomes, so you can open the episodes that changed.
      </P>

      <H2 id="fisher">Unpaired comparison: Fisher</H2>
      <P>
        When the fingerprints differ or the seeds do not match, there are no pairs. Shakedown
        falls back to a two-sided Fisher exact test on the two success counts, treating the
        runs as independent samples. The check message says <C>unpaired</C>, and no regressed
        or improved seeds are reported.
      </P>
      <P>
        The fallback is much less sensitive. Take a baseline at 45 of 50 and a candidate at 38
        of 50, a drop of 14 points:
      </P>
      <DocTable
        caption="The same two results compared paired and unpaired"
        head={["Comparison", "Test", "p-value", "Verdict at the default rule"]}
        monoFirst={false}
        numeric={[2]}
        rows={[
          ["Paired, 8 seeds regressed and 1 improved", "exact McNemar", "0.039", "FAIL"],
          ["Unpaired", "Fisher exact", "0.108", "WARN"],
        ]}
      />
      <P>
        Keep scenario files, seeds and episode counts unchanged between the runs you intend to
        compare.
      </P>

      <H2 id="regression-rule">The regression rule</H2>
      <P>
        The regression check uses two numbers: <C>max_drop</C>, 0.05 by default, and{" "}
        <C>confidence</C>, 0.95 by default. With a baseline it is applied to every condition,
        whether or not the scenario lists a <C>regression</C> assertion.
      </P>
      <OL>
        <LI>
          Compute the drop: baseline success rate minus candidate success rate.
        </LI>
        <LI>
          If the drop is at most <C>max_drop</C>, the check is PASS. An improvement is a
          negative drop and always passes.
        </LI>
        <LI>
          Otherwise, if the p-value is below 1 − <C>confidence</C>, the check is FAIL.
        </LI>
        <LI>Otherwise the check is WARN.</LI>
      </OL>
      <P>Two consequences are worth knowing:</P>
      <UL>
        <LI>
          A small drop passes however significant it is. A drop of 4 points with a p-value of
          0.001 is PASS under the default rule. Lower <C>max_drop</C> if small, certain losses
          matter to you.
        </LI>
        <LI>
          The test asks whether the two checkpoints differ at all, not whether the drop
          exceeds <C>max_drop</C>. <C>max_drop</C> is a threshold on the observed drop, and the
          p-value guards against reporting noise.
        </LI>
      </UL>

      <H2 id="how-many-episodes">How many episodes to run</H2>
      <P>
        More episodes give narrower intervals and cost more simulation time. The right number
        depends on which question you are asking.
      </P>

      <H3 id="absolute">For a success rate</H3>
      <P>
        To estimate a success rate to within a margin, the engine’s{" "}
        <C>episodes_needed</C> function uses the normal approximation:
      </P>
      <CodeBlock filename="episodes_needed(p, margin, confidence)" code={needed} />
      <P>
        The table gives the episodes needed for a 95% interval of the given half-width. It was
        computed with <C>episodes_needed</C>.
      </P>
      <DocTable
        caption="Episodes needed for a 95% interval of a given half-width"
        head={["True success rate", "± 15 points", "± 10 points", "± 5 points", "± 3 points"]}
        numeric={[0, 1, 2, 3, 4]}
        monoFirst={false}
        rows={[
          ["50%", "43", "97", "385", "1068"],
          ["70%", "36", "81", "323", "897"],
          ["80%", "28", "62", "246", "683"],
          ["90%", "16", "35", "139", "385"],
          ["95%", "9", "19", "73", "203"],
        ]}
      />
      <UL>
        <LI>Halving the margin takes four times the episodes.</LI>
        <LI>
          Rates near 50% need the most episodes. Rates near 0% or 100% need the fewest, but the
          approximation is also least accurate there. Treat the last rows as lower bounds.
        </LI>
        <LI>
          With the default 50 episodes, expect an interval of roughly ± 10 points around 80%.
          Fifty episodes can tell 80% from 50%. They cannot tell 80% from 75%.
        </LI>
      </UL>
      <CodeBlock lang="python" filename="Computing your own values" code={python} />

      <H3 id="paired">For a regression</H3>
      <P>
        A paired comparison needs fewer episodes than the table suggests, because it depends on
        the discordant seeds and not on the width of two intervals. What matters is how many
        seeds change outcome:
      </P>
      <UL>
        <LI>
          A FAIL at the default confidence needs at least 6 discordant seeds, all in the same
          direction.
        </LI>
        <LI>
          If a regression makes the policy fail on 10% of the seeds it used to solve, 50
          episodes produce about 5 such seeds. That is not enough. 100 episodes produce about
          10, which is.
        </LI>
        <LI>
          A deterministic policy in a deterministic simulator gives the same outcome for the
          same seed every time. Two runs of the same checkpoint on the same machine then have
          no discordant seeds at all.
        </LI>
      </UL>

      <H3 id="practice">In practice</H3>
      <DocTable
        caption="Suggested episode counts"
        head={["Use", "Episodes per condition", "What it can show"]}
        monoFirst={false}
        numeric={[1]}
        rows={[
          [
            "Smoke test",
            "5 to 10",
            "That the suite runs. At this size only a complete breakdown produces a FAIL.",
          ],
          [
            "Every pull request",
            "50",
            "Large regressions: a condition that loses 15 points or more, or 6 or more seeds.",
          ],
          [
            "Before a release",
            "100 to 250",
            "Regressions of 5 to 10 points, and success rates to within about ± 5 to 8 points.",
          ],
        ]}
      />
      <P>
        These are starting points derived from the tables above, not measurements of any
        policy. When a condition returns WARN, the message states how many episodes it would
        take to settle that particular case.
      </P>

      <H2 id="first-divergence">First-divergence detection</H2>
      <P>
        For a failed episode in a perturbed condition, Shakedown reports the first step at
        which the policy’s behavior departs from the unperturbed episode on the same seed. It
        tells you where in the replay to start looking.
      </P>

      <H3 id="divergence-measure">What it measures</H3>
      <P>
        The same policy is run on the same seed twice: once under the condition, once with no
        perturbations. Both episodes start from the same initial state. The comparison is
        between the two sequences of <Strong>actions as the policy commanded them</Strong>,
        before any action perturbation is applied.
      </P>
      <CodeBlock filename="Per-step divergence" code={divergence} />
      <UL>
        <LI>
          The difference in each action dimension is divided by the range that dimension
          covered in the nominal episode. A joint that sweeps 1 radian and a gripper that moves
          0.05 are then on the same scale.
        </LI>
        <LI>The divergence of a step is the largest scaled difference over all dimensions.</LI>
        <LI>
          Only the steps both episodes have are compared. The range of each dimension is taken
          over the whole nominal episode, including the steps after the perturbed episode
          ended.
        </LI>
      </UL>
      <P>
        The nominal action traces come from the unperturbed condition of the same run when it
        has the same environment, step limit and seeds. Otherwise Shakedown runs the missing
        unperturbed episodes itself, which adds simulation time. Traces are cached in the run
        directory under <C>nominal/</C>.
      </P>

      <H3 id="divergence-thresholds">Thresholds</H3>
      <DocTable
        caption="Constants of first-divergence detection"
        head={["Constant", "Value", "Meaning"]}
        rows={[
          [
            "THRESHOLD",
            "0.15",
            "A step diverges when its divergence exceeds 15% of the nominal action range.",
          ],
          [
            "SUSTAIN",
            "5",
            "The divergence must stay above the threshold for 5 consecutive steps. The reported step is the first of them.",
          ],
          [
            "MIN_RANGE",
            "0.05",
            "Floor on the range of each dimension, so that dimensions that barely move do not dominate.",
          ],
        ]}
      />
      <P>
        The constants are fixed in <C>engine/src/shakedown/divergence.py</C>. They are not
        configurable from a scenario.
      </P>
      <P>Outcomes other than a step index:</P>
      <UL>
        <LI>
          If no sustained divergence is found and the perturbed episode ran longer than the
          nominal one, the reported step is the length of the nominal episode: the point at
          which the nominal episode had already finished.
        </LI>
        <LI>
          Otherwise, if no sustained divergence is found, no step is reported. The actions
          stayed close and the episode still failed, which points at the physics and not at
          the policy’s reaction.
        </LI>
      </UL>
      <P>
        The per-step divergence is stored in the episode trace as the signal{" "}
        <C>action_divergence</C>. Successful episodes and episodes of unperturbed conditions
        get no divergence step.
      </P>
      <P>
        The same comparison records whether the unperturbed episode succeeded, as the field{" "}
        <C>nominal_success</C> of the episode:
      </P>
      <DocTable
        caption="Values of nominal_success"
        head={["Value", "Meaning"]}
        rows={[
          [
            "true",
            "The seed succeeds with no perturbation. The failure appeared under the condition.",
          ],
          [
            "false",
            "The seed also fails with no perturbation. The perturbation may not be the cause of this failure.",
          ],
          [
            "null",
            "Not checked: the episode succeeded, or belongs to an unperturbed condition.",
          ],
        ]}
      />

      <H3 id="divergence-reading">How to read it</H3>
      <Callout kind="warning" title="A heuristic, not a causal claim">
        <p>
          The first divergent step is where the commanded actions start to differ by more
          than a fixed threshold. It is not the step at which the failure was caused, and it
          does not identify what in the observation the policy reacted to.
        </p>
      </Callout>
      <UL>
        <LI>
          <Strong>The cause can come earlier.</Strong> A perturbed image may push the policy
          slightly off course for many steps before the difference crosses the threshold.
        </LI>
        <LI>
          <Strong>Divergence is not failure.</Strong> The policy may diverge from the nominal
          actions because it is correctly adapting, for example reaching for an object that
          was moved.
        </LI>
        <LI>
          <Strong>With object_pose it is near step 0 by design.</Strong> The scene differs from
          the first frame, so the actions should differ too.
        </LI>
        <LI>
          <Strong>Sampling policies diverge on their own.</Strong> Shakedown seeds the policy
          per episode, so a sampling policy draws the same noise in both episodes. If a policy
          has a source of randomness that the seed does not control, its two episodes diverge
          without any perturbation.
        </LI>
      </UL>
      <P>
        Use the step to open the replay at the right place, then look at the policy view, the
        external view and the signals around it.
      </P>
    </DocPage>
  );
}
