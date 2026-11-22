import { CodeBlock } from "@/components/docs/code-block";
import { DocPage } from "@/components/docs/doc-page";
import { pageMetadata } from "@/components/docs/nav";
import { A, C, Callout, H2, H3, LI, P, Strong, UL } from "@/components/docs/prose";
import { DocTable } from "@/components/docs/table";
import type { TocItem } from "@/components/docs/toc";

const href = "/docs/environments";

export const metadata = pageMetadata(href);

const toc: TocItem[] = [
  { id: "built-in", title: "Built-in environments" },
  { id: "aloha-transfer-cube", title: "aloha/transfer_cube" },
  { id: "aloha-insertion", title: "aloha/insertion" },
  { id: "pusht", title: "pusht" },
  { id: "signals", title: "Recorded signals" },
  { id: "contacts", title: "Contact groups" },
  { id: "rendering", title: "Rendering backend" },
  { id: "adding", title: "Adding an environment" },
  { id: "interface", title: "The EnvAdapter interface", level: 3 },
  { id: "scene-map", title: "The SceneMap", level: 3 },
  { id: "registering", title: "Registering the adapter", level: 3 },
];

const adapter = `from typing import ClassVar

import numpy as np

from shakedown.envs.base import EnvAdapter, register_env
from shakedown.perturbations.base import SimPerturbation
from shakedown.types import Observation, StepResult


@register_env
class MyTask(EnvAdapter):
    id: ClassVar[str] = "mycell/pick_place"
    backend: ClassVar[str] = "mujoco"
    fps: ClassVar[int] = 50
    default_max_steps: ClassVar[int] = 400
    max_reward: ClassVar[float] = 1.0
    supported: ClassVar[frozenset[str]] = frozenset({"lighting", "object_pose"})
    task_description: ClassVar[str] = "Pick up the part and place it in the fixture."

    def __init__(self, perturbations: list[SimPerturbation] | None = None):
        # Raises UnsupportedPerturbation for anything not in \`supported\`.
        super().__init__(perturbations)
        # Build the simulator here and apply self.perturbations to it.

    def reset(self, seed: int) -> Observation:
        # Must be deterministic in \`seed\`.
        ...

    def step(self, action: np.ndarray) -> tuple[Observation, StepResult]:
        ...

    def action_dim(self) -> int:
        return 7

    # Optional.
    def initial_views(self) -> dict[str, np.ndarray]:
        # External camera image before the first step, for the replay video.
        ...

    def failure_label(self, max_reward: float, signals: dict[str, list[float]]) -> str:
        return "part was never grasped"

    def close(self) -> None:
        ...`;

const types = `@dataclass
class Observation:
    images: dict[str, np.ndarray]   # camera name -> H x W x 3, uint8
    state: np.ndarray               # proprioceptive state
    task: str = ""                  # instruction for language-conditioned policies


@dataclass
class StepResult:
    reward: float
    success: bool
    terminated: bool
    signals: dict[str, float]       # scalar diagnostics for the replay timeline
    contacts: set[str]              # contact groups touching this step
    views: dict[str, np.ndarray]    # extra cameras for the replay, not shown to the policy`;

const sceneMap = `from shakedown.envs.mujoco_scene import SceneMap

scene = SceneMap(
    object_geoms=["red_box"],            # geoms that make up the task object(s)
    object_bodies=["box"],               # bodies that carry them; used for mass
    surface_geoms=["table"],             # geoms of the work surface
    robot_geom_prefixes=["vx300s_"],     # name prefixes identifying robot geoms
    finger_geom_markers=["gripper_finger"],   # substrings identifying finger geoms
    distractor_region=(-0.30, 0.30, 0.38, 0.82, 0.0),   # xmin, xmax, ymin, ymax, z in meters
    keep_clear=[(0.10, 0.50, 0.17)],     # (x, y, radius) areas distractors must avoid
)`;

const builtin = `_BUILTIN = {
    "aloha/": "shakedown.envs.aloha",
    "pusht": "shakedown.envs.pusht",
    "mycell/": "shakedown.envs.mycell",   # added
}`;

export default function EnvironmentsPage() {
  return (
    <DocPage
      href={href}
      toc={toc}
      lead="An environment is one simulated task behind a small, uniform interface. Shakedown ships three. This page describes what each one gives the policy, how success is decided, and how to add your own."
    >
      <H2 id="built-in">Built-in environments</H2>
      <DocTable
        caption="Built-in environments"
        head={["Id", "Backend", "Action", "Rate", "Step limit", "Sim perturbations"]}
        rows={[
          [
            <a key="a" href="#aloha-transfer-cube" className="underline decoration-line-strong underline-offset-4 hover:decoration-accent">
              aloha/transfer_cube
            </a>,
            "mujoco",
            "14-D",
            "50 Hz",
            "400",
            "all 10",
          ],
          [
            <a key="a" href="#aloha-insertion" className="underline decoration-line-strong underline-offset-4 hover:decoration-accent">
              aloha/insertion
            </a>,
            "mujoco",
            "14-D",
            "50 Hz",
            "400",
            "all 10",
          ],
          [
            <a key="a" href="#pusht" className="underline decoration-line-strong underline-offset-4 hover:decoration-accent">
              pusht
            </a>,
            "pymunk",
            "2-D",
            "10 Hz",
            "300",
            "object_pose, object_physics, object_appearance (color only)",
          ],
        ]}
      />
      <P>
        The step limit is the default. A scenario overrides it with <C>max_steps</C>. An
        environment is listed by <C>shakedown list</C> only when its simulator is installed.
        All io perturbations work with every environment.
      </P>

      <H2 id="aloha-transfer-cube">aloha/transfer_cube</H2>
      <P>
        Two ViperX arms on a table, from the <C>gym-aloha</C> package, simulated in MuJoCo
        through <C>dm_control</C>. The right arm picks up a cube and hands it to the left arm.
      </P>
      <DocTable
        caption="Spaces of aloha/transfer_cube"
        head={["Item", "Value"]}
        monoFirst={false}
        rows={[
          [
            "Image",
            <>
              One camera, <C>top</C>. 480 by 640 pixels, RGB, 8 bits per channel.
            </>,
          ],
          [
            "State",
            "14 values: 6 joint positions and 1 normalized gripper position for the left arm, then the same for the right arm.",
          ],
          ["Action", "14 values: target joint positions, in the same layout as the state."],
          [
            "Task string",
            "“Pick up the cube with the right arm and transfer it to the left arm.”",
          ],
          [
            "Replay view",
            <>
              The camera named <C>angle</C>. It is recorded for the video and never shown to the
              policy.
            </>,
          ],
        ]}
      />
      <P>
        <Strong>Success.</Strong> The task reward is a stage counter from 0 to 4. An episode
        succeeds at the first step where the reward reaches 4, and ends there. An episode that
        reaches the step limit first is a failure. A failed episode is labeled by the highest
        reward it reached:
      </P>
      <DocTable
        caption="Failure labels of aloha/transfer_cube"
        head={["Highest reward", "Failure label"]}
        numeric={[0]}
        monoFirst={false}
        rows={[
          ["0", "right gripper never touched the cube"],
          ["1", "touched the cube but did not lift it"],
          ["2", "lifted the cube but the left gripper never reached it"],
          ["3", "handover started but the cube was not lifted clear"],
        ]}
      />
      <P>
        <Strong>Signals:</Strong> <C>reward</C>, <C>object_height_m</C>,{" "}
        <C>right_gripper_to_object_m</C>, <C>left_gripper_to_object_m</C>.
      </P>

      <H2 id="aloha-insertion">aloha/insertion</H2>
      <P>
        The same robot and scene. The right arm picks up a peg, the left arm picks up a socket,
        and the peg is inserted into the socket. Image, state, action, rates and replay view
        are the same as for <C>aloha/transfer_cube</C>.
      </P>
      <P>
        The task string is “Pick up the peg and the socket, then insert the peg into the
        socket.” Success is decided the same way, by the reward reaching 4.
      </P>
      <DocTable
        caption="Failure labels of aloha/insertion"
        head={["Highest reward", "Failure label"]}
        numeric={[0]}
        monoFirst={false}
        rows={[
          ["0", "did not grasp both the peg and the socket"],
          ["1", "touched both parts but did not lift them"],
          ["2", "lifted both parts but never brought them together"],
          ["3", "peg reached the socket but was not inserted"],
        ]}
      />
      <P>
        <Strong>Signals:</Strong> <C>reward</C>, <C>peg_height_m</C>, <C>socket_height_m</C>,{" "}
        <C>peg_to_socket_m</C>, <C>right_gripper_to_peg_m</C>,{" "}
        <C>left_gripper_to_socket_m</C>.
      </P>
      <P>
        Object perturbations apply to both parts. <C>object_pose</C> moves the peg and the
        socket by the same offset. <C>object_appearance</C> and <C>object_physics</C> change
        both.
      </P>

      <H2 id="pusht">pusht</H2>
      <P>
        A 2-D task from the <C>gym-pusht</C> package, simulated with pymunk. A circular agent
        pushes a T-shaped block onto a T-shaped target. It is included so that nothing in the
        runner, the perturbations or the reports depends on one physics engine.
      </P>
      <DocTable
        caption="Spaces of pusht"
        head={["Item", "Value"]}
        monoFirst={false}
        rows={[
          [
            "Image",
            <>
              One image, <C>image</C>. 96 by 96 pixels, RGB, 8 bits per channel.
            </>,
          ],
          ["State", "2 values: the agent position in workspace units."],
          [
            "Action",
            "2 values: the target agent position. Clipped to the range 0 to 512 before it is applied.",
          ],
          ["Task string", "“Push the T-shaped block onto the T-shaped target.”"],
          ["Replay view", "The environment’s own render at 384 by 384 pixels."],
        ]}
      />
      <P>
        <Strong>Success.</Strong> An episode succeeds when the block covers more than 95% of
        the target. A failed episode is labeled with the best coverage it reached.
      </P>
      <P>
        <Strong>Signals:</Strong> <C>reward</C>, <C>coverage</C>, <C>block_to_goal_mm</C>,{" "}
        <C>agent_to_block_mm</C>.
      </P>
      <P>
        A small suite for this environment is bundled in <C>scenarios/pusht/</C>. The
        workspace is 512 by 512 units and one unit is treated as one millimeter. That
        convention is what converts the centimeter parameters of <C>object_pose</C> and gives
        the two distance signals their unit. The environment reports no contacts.
      </P>

      <H2 id="signals">Recorded signals</H2>
      <P>
        A signal is one number per control step, stored in the episode trace and drawn on the
        replay timeline. Besides the signals of the environment, the runner records:
      </P>
      <DocTable
        caption="Signals recorded by the runner"
        head={["Signal", "Recorded for", "Meaning"]}
        rows={[
          [
            "action_change",
            "every episode",
            "Euclidean norm of the difference between this step’s action and the previous one, as the policy commanded them. 0 at the first step.",
          ],
          [
            "action_divergence",
            "failed episodes of perturbed conditions",
            <>
              Distance between the actions of this episode and of the unperturbed episode on
              the same seed. See{" "}
              <A href="/docs/statistics#first-divergence">first-divergence detection</A>.
            </>,
          ],
        ]}
      />

      <H2 id="contacts">Contact groups</H2>
      <P>
        At every step the MuJoCo environments classify the active contacts into named groups.
        The episode trace stores the first step at which each group occurred. The{" "}
        <A href="/docs/scenarios#no-contact">no_contact</A> assertion counts the episodes in
        which a group occurred at all.
      </P>
      <DocTable
        caption="Contact groups"
        head={["Group", "Contact between"]}
        rows={[
          ["robot:table", "An arm link other than a gripper finger, and the work surface."],
          ["gripper:table", "A gripper finger and the work surface."],
          ["robot:distractor", "An arm link other than a gripper finger, and a distractor."],
          ["gripper:distractor", "A gripper finger and a distractor."],
          ["object:distractor", "A task object and a distractor."],
          ["robot:scene", "An arm link other than a gripper finger, and a scanned scene."],
          ["gripper:scene", "A gripper finger and a scanned scene."],
          ["object:scene", "A task object and a scanned scene."],
        ]}
      />
      <UL>
        <LI>
          Fingers are reported separately because a finger brushing the table is normal during
          a grasp, while an arm link hitting it is not.
        </LI>
        <LI>
          Contact between the task object and the table is not reported. The object rests on
          the table.
        </LI>
        <LI>Contact between the robot and the task object is not reported.</LI>
        <LI>
          Distractor groups occur only in conditions that use the <C>distractors</C>{" "}
          perturbation, and scene groups only in conditions that use <C>scanned_scene</C>{" "}
          with collisions on.
        </LI>
      </UL>

      <H2 id="rendering">Rendering backend</H2>
      <P>
        The ALOHA environments render through MuJoCo. When the environment variable{" "}
        <C>MUJOCO_GL</C> is not set, the engine sets it to <C>egl</C> on Linux and to{" "}
        <C>glfw</C> on macOS. Set <C>MUJOCO_GL</C> yourself to use another backend. The{" "}
        <C>pusht</C> environment sets <C>SDL_VIDEODRIVER=dummy</C> in the same way, so it needs
        no display.
      </P>

      <H2 id="adding">Adding an environment</H2>
      <P>
        An adapter wraps one simulator task so that the runner, the perturbations and the
        policies never touch simulator-specific code. Adding one means writing a subclass of{" "}
        <C>EnvAdapter</C> and registering it.
      </P>

      <H3 id="interface">The EnvAdapter interface</H3>
      <P>
        The interface is defined in <C>engine/src/shakedown/envs/base.py</C>.
      </P>
      <CodeBlock lang="python" filename="engine/src/shakedown/envs/mycell.py" code={adapter} />
      <DocTable
        caption="Class attributes of an EnvAdapter"
        head={["Attribute", "Type", "Meaning"]}
        rows={[
          ["id", "str", "Registry id, used as env in scenario files."],
          ["backend", "str", "Simulator name, shown in reports."],
          ["fps", "int", "Control steps per second. Sets the frame rate of replay videos."],
          ["default_max_steps", "int", "Step limit when the scenario sets none."],
          [
            "max_reward",
            "float",
            "Reward that counts as full success. Used by the default failure label.",
          ],
          [
            "supported",
            "frozenset[str]",
            "Names of the sim perturbations the adapter implements. Anything else is refused.",
          ],
          [
            "task_description",
            "str",
            "Instruction passed to language-conditioned policies.",
          ],
        ]}
      />
      <DocTable
        caption="Methods of an EnvAdapter"
        head={["Method", "Required", "Contract"]}
        rows={[
          [
            "reset(seed)",
            "yes",
            "Start an episode and return the first observation. The initial state must depend only on the seed and the perturbations.",
          ],
          [
            "step(action)",
            "yes",
            "Apply one action. Return the next observation and a StepResult.",
          ],
          ["action_dim()", "yes", "Length of the action vector."],
          [
            "initial_views()",
            "no",
            "External views before the first step. Without it the first video frame has no external view.",
          ],
          [
            "failure_label(max_reward, signals)",
            "no",
            "Short description of how far a failed episode got. The default reports the reward reached.",
          ],
          ["close()", "no", "Release simulator resources."],
        ]}
      />
      <P>The two data types the methods exchange:</P>
      <CodeBlock lang="python" filename="engine/src/shakedown/types.py" code={types} />
      <Callout kind="warning" title="Success needs terminated">
        <p>
          The runner reads <C>success</C> only from a step that also sets{" "}
          <C>terminated</C>. An episode that reaches the step limit without a terminated step
          is a failure, even if earlier steps reported <C>success=True</C>. Set both on the
          step where the task is solved.
        </p>
      </Callout>

      <H3 id="scene-map">The SceneMap</H3>
      <P>
        For a MuJoCo scene you do not have to implement the sim perturbations yourself.{" "}
        <C>engine/src/shakedown/envs/mujoco_scene.py</C> implements them against a compiled
        model plus a <C>SceneMap</C> that names the parts of the scene a task cares about.
      </P>
      <CodeBlock lang="python" code={sceneMap} />
      <DocTable
        caption="Functions of mujoco_scene.py"
        head={["Function", "Use"]}
        rows={[
          [
            "apply_model_perturbation(model, data, scene, p)",
            <>
              Applies <C>lighting</C>, <C>camera_pose</C>, <C>object_appearance</C>,{" "}
              <C>object_physics</C>, <C>surface_appearance</C>, <C>actuator_gain</C> or{" "}
              <C>joint_damping</C> to a compiled model. Returns <C>False</C> for a perturbation
              it does not handle.
            </>,
          ],
          [
            "distractor_elements(p, scene, prefix)",
            <>
              Returns MJCF body elements for a <C>distractors</C> perturbation. Append them to
              the <C>worldbody</C> before the model is compiled. Their names must start with{" "}
              <C>distractor</C> for contacts to be classified.
            </>,
          ],
          [
            "scanned_scene_elements(p, index)",
            <>
              Returns the mesh assets and the static body for a <C>scanned_scene</C>{" "}
              perturbation. Add the meshes to <C>asset</C> and the body to{" "}
              <C>worldbody</C> before the model is compiled. Geom names start with{" "}
              <C>scan</C>, which is how contacts with the scan are classified.
            </>,
          ],
          [
            "contact_groups(model, data, scene)",
            <>
              Returns the contact groups active at the current step, for{" "}
              <C>StepResult.contacts</C>.
            </>,
          ],
        ]}
      />
      <P>
        <C>object_pose</C> is not handled by these functions, because how a task samples its
        initial state is specific to the task. Apply it in <C>reset</C>. A name in the{" "}
        <C>SceneMap</C> or in a perturbation that the model does not contain raises{" "}
        <C>UnknownSceneName</C>, whose message lists the names the model has. Raise{" "}
        <C>UnsupportedPerturbation</C> in the constructor for a parameter your adapter cannot
        realize. <C>shakedown validate</C> and the check at the start of{" "}
        <C>shakedown run</C> build every scene and report any exception from the constructor
        or the first <C>reset</C>. The ALOHA adapter in{" "}
        <C>engine/src/shakedown/envs/aloha.py</C> is the reference for all of this.
      </P>

      <H3 id="registering">Registering the adapter</H3>
      <P>
        The <C>@register_env</C> decorator adds the class to the registry when its module is
        imported. The CLI imports adapter modules on demand from a table of built-in modules
        keyed by id prefix. It has no plugin mechanism yet, so to use your adapter from the
        CLI, place the module inside the engine and add it to <C>_BUILTIN</C> in{" "}
        <C>engine/src/shakedown/envs/base.py</C>. The engine is installed in editable mode, so
        the change takes effect without reinstalling.
      </P>
      <CodeBlock lang="python" filename="engine/src/shakedown/envs/base.py" code={builtin} />
      <P>
        Then confirm that the environment is listed and that a scenario using it validates:
      </P>
      <CodeBlock
        lang="shell"
        code={`shakedown list
shakedown validate scenarios/mycell`}
      />
    </DocPage>
  );
}
