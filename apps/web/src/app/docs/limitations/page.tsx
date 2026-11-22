import { DocPage } from "@/components/docs/doc-page";
import { pageMetadata } from "@/components/docs/nav";
import { A, C, H2, LI, P, Strong, UL } from "@/components/docs/prose";
import type { TocItem } from "@/components/docs/toc";

const href = "/docs/limitations";

export const metadata = pageMetadata(href);

const toc: TocItem[] = [
  { id: "simulation", title: "Simulation is not reality" },
  { id: "contact", title: "Contact is where it is weakest" },
  { id: "scene", title: "Results are as representative as the scene" },
  { id: "coverage", title: "Tests cover the listed conditions only" },
  { id: "statistics", title: "Statistics have limits" },
  { id: "divergence", title: "First divergence is a heuristic" },
  { id: "rendering", title: "Rendering differs across machines" },
  { id: "served", title: "Served policies run one episode at a time" },
  { id: "delay", title: "Simulated delay is uncompensated by default" },
  { id: "cloud", title: "Cloud runs cover sim-trained public models" },
  { id: "suggestions", title: "Suggestions are rules, not learned" },
  { id: "untested", title: "Not yet tested on real hardware" },
  { id: "engine", title: "Current gaps in the engine" },
  { id: "use", title: "How to use the results" },
];

export default function LimitationsPage() {
  return (
    <DocPage
      href={href}
      toc={toc}
      lead="What a Shakedown result does and does not tell you. Read this before you rely on a verdict to decide whether a policy goes onto a robot."
    >
      <H2 id="simulation">Simulation is not reality</H2>
      <P>
        Every episode runs in a simulator. A simulator approximates rendering, physics,
        sensors and actuators, and a learned policy can be sensitive to exactly the details
        that the approximation gets wrong. A pass in simulation is evidence that a policy
        works. It is not proof.
      </P>
      <P>
        Shakedown is most reliable as a <Strong>regression</Strong> test: the same simulator,
        the same seeds, two checkpoints. Errors in the simulator then affect both sides of the
        comparison. Absolute success rates carry more of the simulator’s error than
        differences do. A simulated 85% does not mean 85% on the robot.
      </P>
      <P>
        Shakedown does not replace testing on the real robot. It reduces how often a bad
        checkpoint gets that far.
      </P>

      <H2 id="contact">Contact is where it is weakest</H2>
      <P>
        Contact-rich manipulation is the hardest thing to simulate faithfully. Friction,
        compliance of the gripper pads, the deformation of soft parts and the exact geometry
        at the point of contact decide whether a grasp holds or an insertion seats, and
        rigid-body simulators model them coarsely.
      </P>
      <UL>
        <LI>
          Treat results on tasks like <C>aloha/insertion</C> with more caution than results on
          tasks that depend mostly on reaching and coarse placement.
        </LI>
        <LI>
          <C>object_physics</C> scales mass and friction inside the simulator’s contact model.
          It tests sensitivity to those parameters. It does not make the contact model more
          accurate.
        </LI>
        <LI>
          <C>actuator_gain</C> and <C>joint_damping</C> apply the same change to every joint.
          Real wear is uneven. The bundled ALOHA model has no joint damping, so{" "}
          <C>joint_damping</C> has an effect there only through its <C>add</C> parameter.
        </LI>
      </UL>

      <H2 id="scene">Results are as representative as the scene</H2>
      <P>
        A result describes the policy in the simulated scene, not in your workcell. The
        built-in environments are standard research tasks. If your workcell has different
        objects, lighting, camera placement or robot, results on the built-in scenes say
        little about it.
      </P>
      <UL>
        <LI>
          A policy trained on data from the real robot may fail in simulation for reasons that
          have nothing to do with its quality, because the simulated images do not look like
          its training images.
        </LI>
        <LI>
          A policy trained in the same simulator it is tested in has the opposite problem. The
          nominal condition matches its training distribution more closely than any real
          deployment will.
        </LI>
      </UL>
      <P>
        Checking simulated results against real trials is described in{" "}
        <A href="/docs/sim-to-real">Sim-to-real validation</A>. Bringing the geometry of your
        own workcell into a scene is described in{" "}
        <A href="/docs/scans">Scanning a workcell</A>. A scanned scene carries the shape of
        the surroundings and one color. It has no textures, materials, mass or moving parts,
        so it does not make the simulated images look like your camera’s.
      </P>

      <H2 id="coverage">Tests cover the listed conditions only</H2>
      <P>
        A perturbation test measures robustness to the conditions in your suite, at the
        strengths you listed, and nothing else. Passing a suite does not mean the policy is
        robust.
      </P>
      <UL>
        <LI>
          <Strong>Unlisted conditions are untested.</Strong> A suite with no lighting scenario
          says nothing about lighting.
        </LI>
        <LI>
          <Strong>Combinations are untested unless listed.</Strong> Passing dim light and
          passing a shifted camera separately does not imply passing both at once.
        </LI>
        <LI>
          <Strong>Perturbations are idealized.</Strong> <C>image_noise</C> is independent
          Gaussian noise. A real sensor’s noise is not. <C>action_latency</C> is a constant
          delay. A real network’s delay varies. Each perturbation is a controlled stand-in for
          a fault, not a model of it.
        </LI>
        <LI>
          <Strong>Between sweep values is interpolation.</Strong> A sweep that passes at 2
          degrees and fails at 4 locates the threshold somewhere between them.
        </LI>
      </UL>

      <H2 id="statistics">Statistics have limits</H2>
      <UL>
        <LI>
          <Strong>Small regressions need many episodes.</Strong> With 50 episodes per
          condition, a drop of 5 points is usually reported as a warning or passes unnoticed.
          See <A href="/docs/statistics#how-many-episodes">how many episodes to run</A>.
        </LI>
        <LI>
          <Strong>Many conditions mean some false alarms.</Strong> Each test is run at its own
          confidence level, with no correction for the number of conditions. At 95% confidence
          and a suite of 20 conditions, expect an occasional failure that is chance.
        </LI>
        <LI>
          <Strong>Episodes share their seeds across conditions.</Strong> The initial states
          are a fixed sample. A policy can be tuned, deliberately or not, to the seeds of the
          suite. Change the seed range from time to time and see whether the results hold.
        </LI>
        <LI>
          <Strong>PASS is a threshold on the observed rate.</Strong> It does not certify the
          true rate. The interval does that.
        </LI>
      </UL>

      <H2 id="divergence">First divergence is a heuristic</H2>
      <P>
        The first divergent step is the first step at which the policy’s commanded actions
        differ from the unperturbed episode by more than a fixed threshold for 5 consecutive
        steps. It is a pointer into the replay. It is not a causal claim: the cause of a
        failure can lie before the step, and a divergence can be the policy adapting
        correctly. The thresholds are fixed and were not tuned per task. The field{" "}
        <C>nominal_success</C> tells you whether the seed fails without the perturbation too,
        in which case the perturbation may not be the cause at all. See{" "}
        <A href="/docs/statistics#first-divergence">first-divergence detection</A>.
      </P>

      <H2 id="rendering">Rendering differs across machines</H2>
      <P>
        The same scene rendered on different GPUs, drivers or rendering backends gives images
        that differ slightly. Floating-point results of inference differ between devices as
        well. A policy reads those images and acts on them over hundreds of steps, so small
        differences can grow until an episode ends differently.
      </P>
      <UL>
        <LI>
          The same seed is repeatable on the same machine and software. It is not guaranteed
          to give the same outcome on another.
        </LI>
        <LI>
          Compare a candidate with a baseline that was run on the same type of machine, with
          the same rendering backend and the same device. Otherwise part of the difference
          you measure is the machine.
        </LI>
        <LI>
          The fingerprint does not include the machine. Two runs on different hardware are
          still treated as paired. The host platform is stored with each result, so you can
          check.
        </LI>
        <LI>
          The same applies to versions of the simulator, of LeRobot and of PyTorch. Pin them
          in CI.
        </LI>
      </UL>

      <H2 id="served">Served policies run one episode at a time</H2>
      <P>
        A policy served over HTTP holds the state of one episode. Runs against it cannot use{" "}
        <C>--workers</C> above 1, so they take as long as the episodes take in sequence, plus
        the time to encode and send every image. Two runs must not share one server at the
        same time. See <A href="/docs/policies#one-episode">Policies</A>.
      </P>

      <H2 id="delay">Simulated delay is uncompensated by default</H2>
      <P>
        The <C>action_latency</C> perturbation delays actions in a simple queue. When a
        policy plans again under delay, its observation does not yet reflect the actions it
        has sent and that are still in the queue. Real deployments usually correct for this.
        Shakedown does so only when the policy’s <C>latency_compensation</C> option is set.
      </P>
      <UL>
        <LI>
          Without the option, results under delay describe an uncompensated deployment. They
          are not evidence about a deployment that compensates.
        </LI>
        <LI>
          This applies to every result that pools delay conditions with others, including
          the choice of <C>shakedown recommend</C> on the example suite.
        </LI>
        <LI>
          A control experiment comparing compensated and uncompensated settings is in
          progress. Its results are not in these docs.
        </LI>
        <LI>
          The simulated delay is constant and known exactly. A real delay varies and has to
          be measured.
        </LI>
      </UL>
      <P>
        See <A href="/docs/runtime-settings#delay">Runtime settings</A>.
      </P>

      <H2 id="cloud">Cloud runs cover sim-trained public models</H2>
      <P>
        A cloud run can test a public Hugging Face model that was trained on the task of a
        hosted suite: the simulated ALOHA transfer-cube task, or PushT. It cannot test a
        private model, your own scene, or a policy trained on a real robot, because the cloud
        has no copy of that robot’s scene. Cloud runs are compared only with earlier cloud
        runs of the same suite and size. See <A href="/docs/cloud-runs">Cloud runs</A>.
      </P>

      <H2 id="suggestions">Suggestions are rules, not learned</H2>
      <P>
        The tests proposed from field reports come from three fixed rules over the numbers
        that robots report: action delay, dropped frames and image brightness. Nothing is
        learned, and no image, observation or action is looked at.
      </P>
      <UL>
        <LI>A condition that no rule looks for is never proposed, however common it is.</LI>
        <LI>
          The measurements are coarse: one median inference time and one mean brightness per
          attempt.
        </LI>
        <LI>
          The brightness rule reports an association between brightness and failure, not a
          cause.
        </LI>
        <LI>
          Reports marked as simulated are treated like real ones by the rules, by the flags
          and by the release gate.
        </LI>
      </UL>
      <P>
        See <A href="/docs/field#suggestions">Field reporting</A>.
      </P>

      <H2 id="untested">Not yet tested on real hardware</H2>
      <P>Four parts of Shakedown have not yet met the physical world.</P>
      <UL>
        <LI>
          <Strong>The real-robot workflow</Strong>, <C>shakedown real record</C> and{" "}
          <C>shakedown real correlate</C>, has been tested with synthetic trial logs only. It
          has not yet been used in a session on a physical robot. See{" "}
          <A href="/docs/sim-to-real#status">Sim-to-real validation</A>.
        </LI>
        <LI>
          <Strong>The field SDK</Strong> has been tested with synthetic reports and with a
          simulated stand-in for a robot. It has not yet run in the control loop of a
          physical robot. See <A href="/docs/field#status">Field reporting</A>.
        </LI>
        <LI>
          <Strong>The release flow</Strong>, from candidate through canary to fleet and
          back, has been exercised with those same synthetic and simulated reports. It has
          not been used to release a policy to a physical robot. Shakedown does not push
          anything to robots in any case. See{" "}
          <A href="/docs/releases#status">Releases and gates</A>.
        </LI>
        <LI>
          <Strong>The scan importer</Strong>, <C>shakedown scan import</C>, has been tested
          with generated meshes only. It has not yet been run on a mesh exported by a phone
          scanning app. See <A href="/docs/scans#status">Scanning a workcell</A>.
        </LI>
      </UL>
      <P>
        Real trial counts are usually small, so the intervals around real success rates are
        wide, and the correlation metrics computed from them are uncertain. A summary line
        that says simulation tracks reality well is a reading of two numbers against fixed
        thresholds, not a guarantee.
      </P>

      <H2 id="engine">Current gaps in the engine</H2>
      <P>These are known gaps in engine version 0.1.0.</P>
      <UL>
        <LI>
          The package is installed from source. It is not published on a package index.
        </LI>
        <LI>
          Environments are registered in the engine’s source. There is no plugin mechanism for
          adapters outside it.
        </LI>
        <LI>
          The check that <C>shakedown validate</C> and <C>shakedown run</C> make builds each
          scene and resets it once. It does not run the policy, so a problem that appears
          only with a policy, such as an image input the environment has no camera for, is
          found in the first episode.
        </LI>
        <LI>
          Only ACT and Diffusion Policy checkpoints have been run. Other LeRobot policy types
          load through the same code path and are unverified.
        </LI>
        <LI>
          Run time has been measured on one Apple laptop only. There is no measurement on
          Linux, on a hosted CI runner or on a CUDA GPU.
        </LI>
        <LI>
          A scenario has at most one sweep variable. A grid over two parameters has to be
          written as separate scenarios.
        </LI>
        <LI>
          The <C>pusht</C> environment supports three sim perturbations and reports no
          contacts.
        </LI>
        <LI>
          A scanned scene is drawn in one color and is placed by hand.
        </LI>
        <LI>
          A served policy is not told the delay of a condition, so{" "}
          <C>latency_compensation=auto</C> works for in-process policies only.
        </LI>
        <LI>
          The two thresholds of the field gate have no field on the project’s settings page.
        </LI>
        <LI>
          <C>shakedown recommend</C> makes no correction for the number of settings it
          compares.
        </LI>
        <LI>
          A relative <C>scanned_scene</C> path is resolved against the directory the command
          is run from, not against the scenario file.
        </LI>
      </UL>

      <H2 id="use">How to use the results</H2>
      <UL>
        <LI>
          Use FAIL to stop a checkpoint. A clear regression in simulation is a good reason not
          to spend robot time on it.
        </LI>
        <LI>
          Use PASS to decide what goes to the robot next, not to skip the robot.
        </LI>
        <LI>
          Watch the replays of failures. A verdict says that something got worse. The video
          usually says what.
        </LI>
        <LI>
          Validate against real trials, and repeat the validation when the workcell changes.
        </LI>
      </UL>
    </DocPage>
  );
}
