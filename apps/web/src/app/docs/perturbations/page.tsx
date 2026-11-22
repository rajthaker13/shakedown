import { CodeBlock } from "@/components/docs/code-block";
import { DocPage } from "@/components/docs/doc-page";
import { pageMetadata } from "@/components/docs/nav";
import { A, C, Callout, H2, H3, LI, P, Strong, UL } from "@/components/docs/prose";
import { DocTable } from "@/components/docs/table";
import type { TocItem } from "@/components/docs/toc";

import {
  allPerturbations,
  ioPerturbations,
  simPerturbations,
  type PerturbationDoc,
} from "./data";

const href = "/docs/perturbations";

export const metadata = pageMetadata(href);

const toc: TocItem[] = [
  { id: "sim-and-io", title: "Sim and io perturbations" },
  { id: "support", title: "Support by environment" },
  { id: "combining", title: "Combining perturbations" },
  { id: "sim", title: "Sim perturbations" },
  ...simPerturbations.map((p): TocItem => ({ id: p.name, title: p.name, level: 3 })),
  { id: "io", title: "Io perturbations" },
  ...ioPerturbations.map((p): TocItem => ({ id: p.name, title: p.name, level: 3 })),
];

const combined = `perturbations:
  - lighting: { intensity: 0.6 }
  - image_noise: { std: 12 }
  - action_latency: { steps: 2 }`;

function support(value: boolean | "partial"): string {
  if (value === "partial") return "Partly";
  return value ? "Yes" : "No";
}

function Reference({ item }: { item: PerturbationDoc }) {
  return (
    <section aria-labelledby={item.name}>
      <H3 id={item.name} mono>
        {item.name}
      </H3>
      <P>{item.summary}</P>
      <P>
        <Strong>Models:</Strong> {item.models}
      </P>
      <P>
        <Strong>Environments:</Strong>{" "}
        {item.kind === "io" ? (
          "all."
        ) : (
          <>
            <C>aloha/transfer_cube</C>, <C>aloha/insertion</C>
            {item.pusht === true ? (
              <>
                , <C>pusht</C>.
              </>
            ) : item.pusht === "partial" ? (
              <>
                , <C>pusht</C> (partly, see below).
              </>
            ) : (
              "."
            )}
          </>
        )}
      </P>
      <DocTable
        caption={`Parameters of ${item.name}`}
        head={["Parameter", "Type", "Default", "Allowed", "Meaning"]}
        rows={item.params.map((p) => [p.name, p.type, <C key="d">{p.default}</C>, p.range, p.meaning])}
      />
      {item.notes.length > 0 ? (
        <UL>
          {item.notes.map((note) => (
            <LI key={note}>{note}</LI>
          ))}
        </UL>
      ) : null}
      <CodeBlock lang="yaml" code={item.example} />
    </section>
  );
}

export default function PerturbationsPage() {
  return (
    <DocPage
      href={href}
      toc={toc}
      lead="A perturbation is a controlled change to the conditions a policy runs under. This page lists all 20 of them, with the fault each one stands in for, its parameters and the environments that support it."
    >
      <H2 id="sim-and-io">Sim and io perturbations</H2>
      <P>There are two kinds. The kind decides where the change is applied.</P>
      <DocTable
        caption="The two kinds of perturbation"
        head={["Kind", "Changes", "Implemented by", "Works with"]}
        rows={[
          [
            "sim",
            "The simulated world: lights, cameras, objects, physics, actuators.",
            "Each environment adapter, because moving a camera means something different in each simulator.",
            "The environments that implement it.",
          ],
          [
            "io",
            "What crosses the boundary between the policy and the world: the images and state the policy receives, and the actions the robot receives.",
            "The engine, once.",
            "Every environment.",
          ],
        ]}
      />
      <P>The difference matters when you read a result:</P>
      <UL>
        <LI>
          A sim perturbation changes the scene itself. Dimming the lights with{" "}
          <C>lighting</C> changes shadows and highlights the way a renderer computes them, and
          the external view in the replay is darker too.
        </LI>
        <LI>
          An io perturbation leaves the scene untouched. <C>image_adjust</C> darkens the pixels
          the policy receives and nothing else. The external view in the replay is unchanged.
        </LI>
        <LI>
          Observation perturbations run before the policy. Action perturbations run after it.
          The replay video shows the image after observation perturbations, which is what the
          policy saw.
        </LI>
      </UL>
      <P>
        <C>shakedown list</C> prints every perturbation with its kind and defaults, and every
        environment with the sim perturbations it supports.
      </P>

      <H2 id="support">Support by environment</H2>
      <DocTable
        caption="Which environments support each perturbation"
        head={["Perturbation", "Kind", "aloha/transfer_cube", "aloha/insertion", "pusht"]}
        rows={allPerturbations.map((p) => [
          <a key="n" href={`#${p.name}`} className="underline decoration-line-strong underline-offset-4 hover:decoration-accent">
            {p.name}
          </a>,
          p.kind,
          support(p.aloha),
          support(p.aloha),
          support(p.pusht),
        ])}
      />
      <P>
        <C>shakedown validate</C> rejects a scenario that uses a sim perturbation its
        environment does not support. It also builds the scene of every condition once, which
        finds a camera that does not exist, a scanned scene that is missing, and distractors
        that cannot be placed. <C>shakedown run</C> makes the same check on the whole suite
        before it loads the policy, and exits with code 2 without running anything.
      </P>

      <H2 id="combining">Combining perturbations</H2>
      <P>
        A scenario may list several perturbations. Sim perturbations are applied when the
        environment is built. Io perturbations are applied at every step, in the order listed:
        in the example, noise is added to the image as rendered under the dimmed light.
      </P>
      <CodeBlock lang="yaml" code={combined} />
      <Callout title="A combined condition tests the combination">
        <p>
          When a condition with three perturbations fails, the result does not say which of
          the three caused it. Keep one perturbation per scenario where you can, and add
          combinations as separate scenarios.
        </p>
      </Callout>
      <P>
        Any parameter can be swept. See <A href="/docs/scenarios#sweeps">Sweeps</A>.
      </P>

      <H2 id="sim">Sim perturbations</H2>
      <P>
        In the MuJoCo environments, sim perturbations edit the model before the first episode.
        They stay fixed for the whole condition, apart from the per-episode jitter of{" "}
        <C>object_pose</C>. <C>scanned_scene</C> needs a scene imported with{" "}
        <C>shakedown scan import</C>, described in{" "}
        <A href="/docs/scans">Scanning a workcell</A>.
      </P>
      {simPerturbations.map((item) => (
        <Reference key={item.name} item={item} />
      ))}

      <H2 id="io">Io perturbations</H2>
      <P>
        Io perturbations that are random draw from a generator derived from the episode seed,
        so an episode sees the same noise every time it is run.
      </P>
      <Callout title="Camera names">
        <p>
          The <C>camera</C> parameter takes the name of an image in the observation:{" "}
          <C>top</C> in the ALOHA environments and <C>image</C> in <C>pusht</C>. A name that
          is not in the observation is reported by <C>shakedown validate</C>, with the names
          the policy does see, and stops <C>shakedown run</C> before it starts. Note that a
          camera can exist in the scene without being given to the policy: <C>camera_pose</C>{" "}
          can move the ALOHA camera <C>angle</C>, but <C>image_noise</C> cannot use it.
        </p>
      </Callout>
      {ioPerturbations.map((item) => (
        <Reference key={item.name} item={item} />
      ))}
    </DocPage>
  );
}
