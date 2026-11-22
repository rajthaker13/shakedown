import { CodeBlock } from "@/components/docs/code-block";
import { DocPage } from "@/components/docs/doc-page";
import { pageMetadata } from "@/components/docs/nav";
import { A, C, Callout, H2, H3, LI, P, Strong, UL } from "@/components/docs/prose";
import { DocTable } from "@/components/docs/table";
import type { TocItem } from "@/components/docs/toc";

const href = "/docs/policies";

export const metadata = pageMetadata(href);

const toc: TocItem[] = [
  { id: "specs", title: "Policy specs" },
  { id: "lerobot", title: "LeRobot checkpoints" },
  { id: "options", title: "Inference options", level: 3 },
  { id: "inputs", title: "How observations are mapped", level: 3 },
  { id: "migration", title: "Checkpoint migration", level: 3 },
  { id: "device", title: "Device selection" },
  { id: "random", title: "The random policy" },
  { id: "http", title: "Served policies" },
  { id: "serve-policy", title: "shakedown serve-policy", level: 3 },
  { id: "one-episode", title: "One episode at a time", level: 3 },
  { id: "protocol", title: "The HTTP policy protocol" },
  { id: "info", title: "GET /info", level: 3 },
  { id: "reset", title: "POST /reset", level: 3 },
  { id: "act", title: "POST /act", level: 3 },
  { id: "images", title: "Image encoding", level: 3 },
  { id: "auth", title: "Bearer token", level: 3 },
  { id: "errors", title: "Errors and timeouts", level: 3 },
  { id: "standalone", title: "A standalone server" },
];

const specs = `# A checkpoint on the Hugging Face Hub
shakedown run scenarios --policy lerobot:lerobot/act_aloha_sim_transfer_cube_human

# A local checkpoint directory
shakedown run scenarios --policy lerobot:outputs/train/act_v2/checkpoints/last/pretrained_model

# The same, with inference options. Quote the spec: ? and & are special in most shells.
shakedown run scenarios --policy "lerobot:lerobot/act_aloha_sim_transfer_cube_human?n_action_steps=25"

# A policy served over HTTP
shakedown run scenarios --policy http://127.0.0.1:8000

# Uniform random actions
shakedown run scenarios --policy random`;

const optionExamples = `# Execute 25 actions of each predicted chunk before predicting again
--policy "lerobot:<checkpoint>?n_action_steps=25"

# ACT temporal ensembling. n_action_steps is forced to 1.
--policy "lerobot:<checkpoint>?temporal_ensemble_coeff=0.01"

# Half-precision weights
--policy "lerobot:<checkpoint>?dtype=float16"

# Compensate for the delay each condition imposes
--policy "lerobot:<checkpoint>?latency_compensation=auto"

# Several options
--policy "lerobot:<checkpoint>?n_action_steps=50&dtype=float16"`;

const serve = `pip install -e "engine[lerobot,server]"

shakedown serve-policy \\
  --policy lerobot:outputs/train/act_v2/checkpoints/last/pretrained_model \\
  --host 127.0.0.1 \\
  --port 8000`;

const serveOut = `serving lerobot:outputs/train/act_v2/checkpoints/last/pretrained_model on http://127.0.0.1:8000`;

const runHttp = `shakedown run scenarios --policy http://127.0.0.1:8000 --label v2`;

const serveToken = `# On the serving machine
export SHAKEDOWN_POLICY_TOKEN="<a long random string>"
shakedown serve-policy \\
  --policy lerobot:outputs/train/act_v2/checkpoints/last/pretrained_model \\
  --host 0.0.0.0

# On the machine that runs the simulator
export SHAKEDOWN_POLICY_TOKEN="<the same string>"
shakedown run scenarios --policy https://policy.example.com --label v2`;

const infoResponse = `{
  "protocol": 1,
  "name": "act-v2",
  "action_dim": 14
}`;

const resetRequest = `{
  "episode_id": "0f3c2a9e6b7d4e1f8a5b9c2d7e4f1a3b",
  "seed": 1007
}`;

const resetResponse = `{ "ok": true }`;

const actRequest = `{
  "episode_id": "0f3c2a9e6b7d4e1f8a5b9c2d7e4f1a3b",
  "step": 0,
  "observation": {
    "images": {
      "top": "iVBORw0KGgoAAAANSUhEUgAA..."
    },
    "state": [0.0, -0.96, 1.16, 0.0, -0.3, 0.0, 0.02, 0.0, -0.96, 1.16, 0.0, -0.3, 0.0, 0.02],
    "task": "Pick up the cube with the right arm and transfer it to the left arm."
  }
}`;

const actResponse = `{
  "action": [0.01, -0.95, 1.15, 0.0, -0.31, 0.0, 0.5, 0.0, -0.96, 1.16, 0.0, -0.3, 0.0, 0.02]
}`;

const decode = `import base64
import io

import numpy as np
from PIL import Image


def decode_image(data: str) -> np.ndarray:
    """Base64 PNG -> H x W x 3 uint8 array, RGB."""
    raw = base64.b64decode(data)
    return np.asarray(Image.open(io.BytesIO(raw)).convert("RGB")).copy()`;

const standalone = `"""A policy server for the Shakedown policy protocol, version 1.

Run with:  uvicorn policy_server:app --host 127.0.0.1 --port 8000
Needs:     pip install fastapi uvicorn numpy pillow
"""

import base64
import hmac
import io
import os
import threading
from typing import Any

import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException
from PIL import Image
from pydantic import BaseModel

ACTION_DIM = 14
TOKEN = os.environ.get("POLICY_TOKEN")  # unset: no authentication


class MyPolicy:
    """Replace this class with calls into your own inference stack."""

    def reset(self, seed: int) -> None:
        # Clear action queues and observation history. Seed any sampling.
        self.rng = np.random.default_rng(seed)

    def act(self, images: dict[str, np.ndarray], state: np.ndarray, task: str) -> np.ndarray:
        # images: camera name -> H x W x 3 uint8. Return one action of length ACTION_DIM.
        return state[:ACTION_DIM].astype(np.float32)


app = FastAPI()
policy = MyPolicy()
# The policy holds per-episode state, so requests are served one at a time.
lock = threading.Lock()
current = {"episode": None}


def authorize(authorization: str | None = Header(default=None)) -> None:
    if TOKEN is None:
        return
    given = (authorization or "").removeprefix("Bearer ").strip()
    if not hmac.compare_digest(given, TOKEN):
        raise HTTPException(status_code=401, detail="invalid or missing token")


class ResetBody(BaseModel):
    episode_id: str
    seed: int


class ActBody(BaseModel):
    episode_id: str
    step: int
    observation: dict[str, Any]


def decode_image(data: str) -> np.ndarray:
    raw = base64.b64decode(data)
    return np.asarray(Image.open(io.BytesIO(raw)).convert("RGB")).copy()


@app.get("/info", dependencies=[Depends(authorize)])
def info() -> dict[str, Any]:
    return {"protocol": 1, "name": "my-policy", "action_dim": ACTION_DIM}


@app.post("/reset", dependencies=[Depends(authorize)])
def reset(body: ResetBody) -> dict[str, Any]:
    with lock:
        policy.reset(body.seed)
        current["episode"] = body.episode_id
    return {"ok": True}


@app.post("/act", dependencies=[Depends(authorize)])
def act(body: ActBody) -> dict[str, Any]:
    obs = body.observation
    with lock:
        if current["episode"] != body.episode_id:
            raise HTTPException(status_code=409, detail="unknown episode_id; call /reset first")
        images = {name: decode_image(data) for name, data in obs.get("images", {}).items()}
        state = np.asarray(obs.get("state", []), dtype=np.float32)
        action = policy.act(images, state, str(obs.get("task", "")))
    return {"action": [float(x) for x in action]}`;

export default function PoliciesPage() {
  return (
    <DocPage
      href={href}
      toc={toc}
      lead="A policy spec is a short string that tells Shakedown where a policy comes from: a LeRobot checkpoint run in-process, a policy served over HTTP, or random actions."
    >
      <H2 id="specs">Policy specs</H2>
      <P>
        The spec is the value of <C>--policy</C>.
      </P>
      <DocTable
        caption="Forms of a policy spec"
        head={["Spec", "Meaning"]}
        rows={[
          [
            "lerobot:<checkpoint>",
            "A LeRobot checkpoint, loaded and run inside the Shakedown process. The checkpoint is a local directory or a Hugging Face Hub id.",
          ],
          [
            "lerobot:<checkpoint>?key=value&key=value",
            "The same, with inference options.",
          ],
          [
            "<checkpoint>",
            <>
              A spec with no <C>:</C> is treated as a LeRobot checkpoint.
            </>,
          ],
          [
            "http://host:port or https://host",
            "A policy served over the HTTP policy protocol. A trailing slash is removed.",
          ],
          ["random", "Uniform random actions."],
        ]}
      />
      <CodeBlock lang="shell" code={specs} />
      <P>
        Any other prefix before the <C>:</C> is an error. The spec is stored in the result as
        given, next to the label.
      </P>

      <H2 id="lerobot">LeRobot checkpoints</H2>
      <P>
        Shakedown loads the checkpoint with LeRobot’s own policy classes and pre- and
        post-processors. The policy type is read from the checkpoint’s configuration.
      </P>
      <DocTable
        caption="Policy types and whether they have been run"
        head={["Policy type", "Status", "Run with"]}
        monoFirst={false}
        rows={[
          [
            "ACT",
            "Has been run",
            <>
              <C>lerobot/act_aloha_sim_transfer_cube_human</C> on{" "}
              <C>aloha/transfer_cube</C>
            </>,
          ],
          [
            "Diffusion Policy",
            "Has been run",
            <>
              <C>lerobot/diffusion_pusht</C> on <C>pusht</C>
            </>,
          ],
          [
            "Other LeRobot policy types",
            "Not verified",
            "They load through the same code path but have not been run.",
          ],
        ]}
      />
      <P>
        Treat a policy type that has not been run as untested. Start with a short run, and
        check in the replay that the policy behaves as it does in your own evaluation.
      </P>

      <H3 id="options">Inference options</H3>
      <P>
        Options after <C>?</C> override inference settings of the checkpoint’s configuration
        for this run. They do not modify the checkpoint.
      </P>
      <DocTable
        caption="Inference options of a lerobot spec"
        head={["Option", "Value", "Meaning"]}
        rows={[
          [
            "n_action_steps",
            "integer",
            "Actions executed from each predicted chunk before the policy is queried again.",
          ],
          [
            "temporal_ensemble_coeff",
            "number",
            <>
              Coefficient for ACT temporal ensembling. When it is set, Shakedown sets{" "}
              <C>n_action_steps</C> to 1, because ensembling needs one inference per step.
            </>,
          ],
          [
            "num_inference_steps",
            "integer",
            "Denoising steps at inference, for policy types that have this setting.",
          ],
          ["n_obs_steps", "integer", "Number of past observations given to the policy."],
          [
            "latency_compensation",
            "integer or auto",
            <>
              Skip the first actions of each new plan, which a known delay has made stale.
              A number skips that many in every condition. <C>auto</C> skips as many as the
              condition delays. The default is no compensation. See{" "}
              <A href="/docs/runtime-settings#latency-compensation">Runtime settings</A>.
            </>,
          ],
          [
            "dtype",
            "float32 or float16",
            <>
              Precision of the weights. <C>float16</C> converts the model to half precision.
              The default is <C>float32</C>.
            </>,
          ],
        ]}
      />
      <CodeBlock lang="shell" code={optionExamples} />
      <UL>
        <LI>
          Values are converted by their form: <C>true</C> and <C>false</C> become booleans,{" "}
          <C>none</C> and <C>null</C> become null, then integers and decimals become numbers.
          Anything else stays a string.
        </LI>
        <LI>An option that is not in the table is an error.</LI>
        <LI>
          <C>latency_compensation</C> must be lower than the number of actions executed per
          plan. The check is made when a condition starts. A served policy is not told the
          delay of a condition, so <C>auto</C> is available to in-process policies only.
        </LI>
        <LI>
          An option that the checkpoint’s policy type does not have is an error. For example{" "}
          <C>temporal_ensemble_coeff</C> on a Diffusion Policy checkpoint.
        </LI>
        <LI>
          When you give no <C>--label</C>, the options are appended to the default label, for
          example <C>act_aloha_sim_transfer_cube_human+n_action_steps=25</C>.
        </LI>
      </UL>
      <Callout title="Testing an inference setting is a valid use">
        <p>
          The options make it possible to treat a deployment setting as the thing under test.
          Run the same checkpoint with two values of <C>n_action_steps</C> and compare the two
          runs with <C>shakedown compare</C>, or sweep several with <C>shakedown tune</C>. See{" "}
          <A href="/docs/runtime-settings">Runtime settings</A>.
        </p>
      </Callout>

      <H3 id="inputs">How observations are mapped</H3>
      <UL>
        <LI>
          Each image input of the policy is matched to the environment camera with the same
          name as the last component of the input key. The input{" "}
          <C>observation.images.top</C> receives the camera <C>top</C>.
        </LI>
        <LI>
          When the policy has exactly one image input and the environment exactly one camera,
          they are matched whatever their names.
        </LI>
        <LI>
          Otherwise a missing camera is an error: the episode raises and the condition ends as
          ERROR.
        </LI>
        <LI>
          Images are passed as floats from 0 to 1 in channel-first layout. The state goes to
          the policy’s <C>observation.state</C> input. The environment’s task string is passed
          as the task.
        </LI>
      </UL>

      <H3 id="migration">Checkpoint migration</H3>
      <P>
        Checkpoints saved before LeRobot moved normalization into processor pipelines contain
        no <C>policy_preprocessor.json</C>. On first use Shakedown converts such a checkpoint
        with LeRobot’s <C>migrate_policy_normalization</C> script and caches the result. Later
        runs use the cached copy.
      </P>
      <UL>
        <LI>
          The cache is <C>~/.cache/shakedown/checkpoints</C>. Set <C>SHAKEDOWN_CACHE</C> to use
          another root directory.
        </LI>
        <LI>
          The cache entry is named after the checkpoint spec, not its contents. If you
          overwrite a local checkpoint of the old format in place, delete its cache entry, or
          the old migrated copy is used.
        </LI>
        <LI>The original checkpoint is not modified.</LI>
      </UL>

      <H2 id="device">Device selection</H2>
      <P>
        <C>--device</C> takes a PyTorch device name such as <C>cuda</C>, <C>mps</C> or{" "}
        <C>cpu</C>. Without it, or with <C>auto</C>, Shakedown uses CUDA when it is available,
        then Apple MPS, then the CPU. The device in use is stored in the result.
      </P>
      <P>
        <C>--device</C> applies to policies run in-process. A served policy chooses its own
        device.
      </P>

      <H2 id="random">The random policy</H2>
      <P>
        <C>random</C> draws every action uniformly from −1 to 1 in each dimension, seeded by
        the episode seed. It is a floor that any trained policy should clear, and a quick way
        to check that a suite runs end to end without downloading a checkpoint. Every scenario
        in the suite must then use environments with the same action dimension.
      </P>

      <H2 id="http">Served policies</H2>
      <P>
        A served policy runs in its own process, behind a small HTTP server. Shakedown drives
        the simulator and sends each observation to the server, which returns an action.
      </P>
      <P>
        <Strong>Why this exists.</Strong> A team can have its policy tested without handing
        over the weights. The party running Shakedown needs only a URL. It also lets you test
        a policy that is not a LeRobot checkpoint: anything that can answer three HTTP routes
        can be tested, in any language and with any inference stack.
      </P>

      <H3 id="serve-policy" mono>
        shakedown serve-policy
      </H3>
      <P>
        The reference server serves any policy that Shakedown can load. It needs the{" "}
        <C>server</C> extra.
      </P>
      <CodeBlock lang="shell" code={serve} />
      <CodeBlock filename="Example output" code={serveOut} />
      <P>Then, from the machine that runs the simulator:</P>
      <CodeBlock lang="shell" code={runHttp} />
      <UL>
        <LI>
          The default host is <C>127.0.0.1</C>, which accepts connections from the same machine
          only. To accept connections from other machines, pass <C>--host 0.0.0.0</C> and a{" "}
          <C>--token</C>. The command prints a warning when it serves on another interface
          without a token.
        </LI>
        <LI>
          For a LeRobot checkpoint the action dimension reported by <C>/info</C> is read from
          the checkpoint. <C>--action-dim</C> overrides it. It is required when serving the{" "}
          <C>random</C> policy, which has no checkpoint to read it from.
        </LI>
        <LI>The server speaks plain HTTP. Put it behind a TLS proxy to serve over HTTPS.</LI>
      </UL>

      <H3 id="one-episode">One episode at a time</H3>
      <P>
        A policy carries state between steps: action queues, observation history. The server
        therefore holds one episode at a time and handles requests one after another. A{" "}
        <C>/reset</C> replaces the current episode.
      </P>
      <Callout kind="warning" title="Use --workers 1 with a served policy">
        <p>
          <C>--workers</C> above 1 spreads conditions across processes, which would interleave
          episodes on the same server. Shakedown refuses this combination before anything
          runs, and the command exits with code 2. Two separate <C>shakedown run</C> commands
          against the same server have the same problem and are not detected: the server
          answers 409 to whichever episode was replaced.
        </p>
      </Callout>

      <H2 id="protocol">The HTTP policy protocol</H2>
      <P>
        This is version 1 of the protocol. It has three routes. Requests and responses are
        JSON.
      </P>
      <DocTable
        caption="Routes of the HTTP policy protocol"
        head={["Route", "Called", "Purpose"]}
        rows={[
          ["GET /info", "once, when the policy is loaded", "Identify the server and its protocol version."],
          ["POST /reset", "before every episode", "Clear the policy’s state and start an episode."],
          ["POST /act", "at every control step", "Return one action for one observation."],
        ]}
      />

      <H3 id="info" mono>
        GET /info
      </H3>
      <CodeBlock lang="json" filename="Response" code={infoResponse} />
      <DocTable
        caption="Fields of the /info response"
        head={["Field", "Type", "Meaning"]}
        rows={[
          [
            "protocol",
            "integer",
            "Must be 1. Shakedown refuses to run against any other value.",
          ],
          ["name", "string", "A name for the policy."],
          ["action_dim", "integer or null", "Length of the action vector, when known."],
        ]}
      />
      <P>
        Only <C>protocol</C> is checked. The whole response is stored in the result under the
        policy’s information, so you may add fields of your own, such as a version or a commit.
        The reference server adds a <C>policy</C> object describing the loaded checkpoint. Do
        not put anything confidential in this response.
      </P>

      <H3 id="reset" mono>
        POST /reset
      </H3>
      <CodeBlock lang="json" filename="Request" code={resetRequest} />
      <CodeBlock lang="json" filename="Response" code={resetResponse} />
      <DocTable
        caption="Fields of the /reset request"
        head={["Field", "Type", "Meaning"]}
        rows={[
          [
            "episode_id",
            "string",
            "A new random identifier for the episode: 32 hexadecimal characters.",
          ],
          [
            "seed",
            "integer",
            "The episode seed. Seed any sampling in the policy with it, so that the episode is repeatable.",
          ],
        ]}
      />
      <P>The content of the response is not read. Any 2xx response with a JSON body is accepted.</P>

      <H3 id="act" mono>
        POST /act
      </H3>
      <P>The values below are illustrative, and the image is shortened.</P>
      <CodeBlock lang="json" filename="Request" code={actRequest} />
      <CodeBlock lang="json" filename="Response" code={actResponse} />
      <DocTable
        caption="Fields of the /act request"
        head={["Field", "Type", "Meaning"]}
        rows={[
          ["episode_id", "string", "The identifier given to the last /reset."],
          ["step", "integer", "Index of the control step, starting at 0."],
          [
            "observation.images",
            "object",
            "Camera name to image. Each image is a PNG file, base64-encoded.",
          ],
          ["observation.state", "list of numbers", "The proprioceptive state."],
          [
            "observation.task",
            "string",
            "The environment’s task instruction, for language-conditioned policies.",
          ],
        ]}
      />
      <P>
        The response must contain <C>action</C>, a non-empty list of numbers whose length is
        the action dimension of the environment. An action of the wrong length is rejected by
        the environment, and the episode is recorded as an error.
      </P>
      <P>
        The observation is what an in-process policy would receive, after any observation
        perturbations. Action perturbations are applied by Shakedown to the action you return.
      </P>

      <H3 id="images">Image encoding</H3>
      <P>
        Images are sent as PNG, which is lossless, so a served policy sees exactly the pixels
        an in-process policy would. Each image is RGB with 8 bits per channel. The PNG bytes
        are encoded with standard base64 and carry no <C>data:</C> prefix.
      </P>
      <CodeBlock lang="python" filename="Decoding an image" code={decode} />

      <H3 id="auth">Bearer token</H3>
      <P>
        A server can require a token. Both sides read it from the same environment variable,{" "}
        <C>SHAKEDOWN_POLICY_TOKEN</C>, or from an option:
      </P>
      <DocTable
        caption="Where the bearer token is set"
        head={["Side", "Option", "Effect"]}
        monoFirst={false}
        rows={[
          [
            "Server",
            <C key="o">shakedown serve-policy --token</C>,
            <>
              Every route, including <C>/info</C>, expects the header{" "}
              <C>Authorization: Bearer &lt;token&gt;</C> and answers 401 without it.
            </>,
          ],
          [
            "Client",
            <C key="o">shakedown run --policy-token</C>,
            "The header is sent with every request to the policy server.",
          ],
        ]}
      />
      <CodeBlock lang="shell" code={serveToken} />
      <UL>
        <LI>
          Prefer the environment variable. A token passed as an option is visible in the
          process list and in shell history.
        </LI>
        <LI>
          The token is sent in a header, in clear text over plain HTTP. The reference server
          does not terminate TLS, so put it behind a TLS proxy when the token crosses a
          network you do not control. The host above is a placeholder.
        </LI>
        <LI>
          A wrong or missing token makes <C>shakedown run</C> stop at <C>/info</C> with status
          401 and exit code 2, before any episode.
        </LI>
        <LI>The token is not written to <C>result.json</C> and is not uploaded.</LI>
      </UL>

      <H3 id="errors">Errors and timeouts</H3>
      <UL>
        <LI>
          If <C>/info</C> cannot be reached or reports another protocol version,{" "}
          <C>shakedown run</C> exits with code 2 before any episode.
        </LI>
        <LI>
          Each request has a timeout of 60 seconds. This includes the first <C>/act</C> of an
          episode, which is often the slowest.
        </LI>
        <LI>
          A failed request, a timeout or a status of 400 or above during an episode makes that
          episode an error. The run continues with the next episode, and the condition ends as
          ERROR.
        </LI>
        <LI>
          The reference server answers 409 to an <C>/act</C> whose <C>episode_id</C> is not the
          current episode.
        </LI>
      </UL>

      <H2 id="standalone">A standalone server</H2>
      <P>
        A team with its own inference stack does not need the Shakedown engine on the serving
        machine. The file below implements the protocol with FastAPI and nothing from
        Shakedown. Replace <C>MyPolicy</C> with calls into your own code.
      </P>
      <CodeBlock lang="python" filename="policy_server.py" code={standalone} />
      <P>
        The example policy returns the current state as the action, which roughly holds the
        ALOHA arms in place. It is only there to make the file run. To check the server, point a
        short run at it:
      </P>
      <CodeBlock
        lang="shell"
        code={`shakedown run scenarios/nominal.yaml --policy http://127.0.0.1:8000 --episodes 2 --videos none`}
      />
      <P>
        Latency added by the HTTP round trip does not change the result of an episode. The
        simulator waits for each action. To test the effect of real latency, use the{" "}
        <A href="/docs/perturbations#action_latency">action_latency</A> perturbation.
      </P>
    </DocPage>
  );
}
