import { CodeBlock } from "@/components/docs/code-block";
import { DocPage } from "@/components/docs/doc-page";
import { pageMetadata } from "@/components/docs/nav";
import { A, C, Callout, H2, H3, LI, P, Strong, UL } from "@/components/docs/prose";
import { DocTable } from "@/components/docs/table";
import type { TocItem } from "@/components/docs/toc";

const href = "/docs/scans";

export const metadata = pageMetadata(href);

const toc: TocItem[] = [
  { id: "status", title: "Status" },
  { id: "what-it-does", title: "What it does" },
  { id: "install", title: "Install" },
  { id: "input", title: "What to scan and export" },
  { id: "import", title: "Importing a scan" },
  { id: "scale-and-up", title: "Scale and up axis", level: 3 },
  { id: "collision", title: "Collision geometry", level: 3 },
  { id: "visual", title: "Visual mesh", level: 3 },
  { id: "scene-directory", title: "The scene directory" },
  { id: "manifest", title: "scene.json", level: 3 },
  { id: "preview", title: "Checking the result", level: 3 },
  { id: "use", title: "Using the scan in a scenario" },
  { id: "limits", title: "Limits" },
];

const install = `pip install -e "engine[lerobot,scan]"`;

const importCmd = `shakedown scan import scans/cell-3.glb \\
  --out scenes/cell-3 \\
  --up y`;

const importOut = `wrote scenes/cell-3
  size        2.41 x 1.87 x 1.12 m
  visual      150,000 triangles
  collision   32 convex pieces
  note      the scan has holes, which is normal for phone scans. Check preview.png.

Use it in a scenario:
  perturbations:
    - scanned_scene: { path: scenes/cell-3 }`;

const tree = `scenes/cell-3/
├── scene.json        # manifest read by the scanned_scene perturbation
├── visual.obj        # the visual mesh, geometry only
├── hull_000.obj      # one file per convex collision piece
├── hull_001.obj
├── ...
├── scene.xml         # a standalone MJCF of the scan alone, for a MuJoCo viewer
└── preview.png       # a render of the scan, unless --no-preview was given`;

const manifest = `{
  "version": 1,
  "source": "cell-3.glb",
  "visual": "visual.obj",
  "hulls": ["hull_000.obj", "hull_001.obj", "hull_002.obj"],
  "color": [0.412, 0.388, 0.351],
  "extent_m": [2.41, 1.87, 1.12],
  "scale": 1.0,
  "up": "y"
}`;

const scenario = `version: 1
name: cell-3
description: The transfer task surrounded by a scan of workcell 3.
env: aloha/transfer_cube
episodes: 50
seed: 1000
perturbations:
  - scanned_scene:
      path: scenes/cell-3
      position: [0, 0.6, 0]
      yaw_deg: 90
      collide: true
      hide_surface: false
assertions:
  success_rate: { min: 0.7 }
  no_contact: { between: robot, and: scene }`;

export default function ScansPage() {
  return (
    <DocPage
      href={href}
      toc={toc}
      lead="shakedown scan import turns a scanned mesh of a real workcell into geometry a simulator can use. The scanned_scene perturbation then places it around a task, so that a policy is tested against the shape of its real surroundings."
    >
      <H2 id="status">Status</H2>
      <Callout kind="warning" title="Not yet tested with a real phone scan">
        <p>
          The importer has been tested with generated meshes only. It has not yet been run
          on a mesh exported by a phone scanning app. Real scans have holes, floating
          fragments, uneven density and arbitrary units and orientation, and some of that
          will need handling the importer does not have yet. Look at <C>preview.png</C>{" "}
          after every import, and expect to adjust <C>--scale</C> and <C>--up</C>.
        </p>
      </Callout>

      <H2 id="what-it-does">What it does</H2>
      <P>
        The built-in scenes are a robot on a table in an empty room. A real workcell has
        walls, fixtures, shelving and clutter. The policy’s camera sees them, and the arms
        can hit them. A scan brings the <Strong>shape</Strong> of those surroundings into the
        test scene.
      </P>
      <P>A simulator needs two things from a scan, and the import produces both:</P>
      <UL>
        <LI>
          <Strong>Collision geometry</Strong> made of convex pieces, because physics engines
          collide convex shapes. The scan is decomposed with CoACD.
        </LI>
        <LI>
          <Strong>A visual mesh</Strong>, which is what cameras render.
        </LI>
      </UL>
      <P>
        The objects the robot manipulates, and the robot itself, still come from the task’s
        own model. A scan adds static surroundings. It does not replace the task.
      </P>

      <H2 id="install">Install</H2>
      <P>
        The import needs the <C>scan</C> extra, which installs <C>trimesh</C>,{" "}
        <C>coacd</C> and <C>mujoco</C>. MuJoCo is used to render the preview. If it cannot be
        imported, the scene is still written, and the command prints a note that no preview
        was rendered.
      </P>
      <CodeBlock lang="shell" code={install} />

      <H2 id="input">What to scan and export</H2>
      <P>
        The input is a triangle mesh in one of four formats. Phone scanning apps that use
        LiDAR or photogrammetry can export at least one of them.
      </P>
      <DocTable
        caption="Accepted mesh formats"
        head={["Format", "Extension", "Notes"]}
        monoFirst={false}
        rows={[
          ["OBJ", ".obj", "Widely supported. The texture and material files are not needed."],
          ["glTF binary", ".glb", "One file. A scene of several meshes is merged into one."],
          ["PLY", ".ply", "Must contain faces. A PLY of points only is not a mesh."],
          ["STL", ".stl", "Geometry only, no color. The scan is drawn in gray."],
        ]}
      />
      <Callout kind="warning" title="Gaussian splats are not meshes">
        <p>
          Many scanning apps now export Gaussian splats, often also as <C>.ply</C>. A splat
          file holds points with color and shape parameters and no triangles. It cannot be
          used for collision geometry and is not accepted: the import stops with the error{" "}
          <C>contains no triangles</C>. Export a mesh from the app.
        </p>
      </Callout>
      <P>
        Scan the surroundings, not the task. Remove or ignore the objects the robot will
        manipulate, because they would become part of the static scene. If the scan contains
        the work surface, see <C>hide_surface</C> below.
      </P>

      <H2 id="import">Importing a scan</H2>
      <CodeBlock lang="shell" code={importCmd} />
      <P>The values below are illustrative.</P>
      <CodeBlock filename="Example output" code={importOut} />
      <P>
        The note about holes appears when the mesh is not watertight. The last lines are a
        snippet to paste into a scenario file. All options are listed in the{" "}
        <A href="/docs/cli#scan-import">CLI reference</A>.
      </P>

      <H3 id="scale-and-up">Scale and up axis</H3>
      <P>
        The simulator works in meters with the Z axis pointing up. Scans come in whatever the
        app chose.
      </P>
      <DocTable
        caption="Options that set units and orientation"
        head={["Option", "Default", "Use"]}
        rows={[
          [
            "--scale",
            "1.0",
            "Multiply the scan’s units to get meters. 0.001 for a scan in millimeters, 0.01 for centimeters.",
          ],
          [
            "--up",
            "z",
            "The axis that points up in the scan: y or z. With y the scan is rotated so that its Y axis becomes Z.",
          ],
        ]}
      />
      <P>After scaling and rotating, the import moves the scan so that:</P>
      <UL>
        <LI>the center of its bounding box, seen from above, is at the origin,</LI>
        <LI>its lowest point is at height 0.</LI>
      </UL>
      <P>
        That origin is what <C>position</C> of the <C>scanned_scene</C> perturbation places.
        The lowest point of a scan is not always the floor: a stray fragment below the floor
        lifts the whole scan.
      </P>
      <P>
        As a check on the scale, the import refuses a scan whose largest dimension, after
        scaling, is below 0.05 m or above 50 m. The error states the size it computed.
      </P>

      <H3 id="collision">Collision geometry</H3>
      <P>
        CoACD splits the scan into convex pieces that together approximate its shape. Two
        options control the trade-off between accuracy and simulation speed.
      </P>
      <DocTable
        caption="Options that control the convex decomposition"
        head={["Option", "Default", "Range", "Effect"]}
        rows={[
          [
            "--max-hulls",
            "32",
            "1 to 512",
            "Largest number of convex pieces. More pieces follow the shape more closely and make every simulation step slower.",
          ],
          [
            "--threshold",
            "0.05",
            "0.01 to 1.0",
            "Decomposition tolerance. Lower follows the surface more closely and takes longer.",
          ],
        ]}
      />
      <UL>
        <LI>
          The collision shape is an approximation. Concave details smaller than the pieces,
          such as the inside of a bin or the gap under a shelf, may be filled in. A policy
          that has to reach into such a space needs a lower threshold and more pieces, and a
          look at the result.
        </LI>
        <LI>
          Thin surfaces scanned from one side, such as a wall, have no thickness in the scan.
          Their convex pieces are correspondingly thin.
        </LI>
        <LI>The decomposition is the slow part of an import, and slower for a large scan.</LI>
      </UL>

      <H3 id="visual">Visual mesh</H3>
      <P>
        The visual mesh is the scan’s geometry: vertex positions and triangles, and nothing
        else. A scan with more than 150,000 triangles is reduced to that number so that the
        scene loads quickly.
      </P>
      <P>
        The whole scan is drawn in <Strong>one color</Strong>, the average color of its
        surface, taken from the scan’s vertex colors or its texture. When the scan has
        neither, the color is a mid gray.
      </P>

      <H2 id="scene-directory">The scene directory</H2>
      <CodeBlock filename="Scene directory" code={tree} />
      <P>
        The directory is self-contained. It can be moved, committed to version control, or
        copied to a CI machine. Importing into a directory that already holds a scene
        replaces it: the files are overwritten, and collision pieces left from the earlier
        import are removed.
      </P>
      <P>
        The files of the scene are part of the{" "}
        <A href="/docs/scenarios#fingerprint">fingerprint</A> of every condition that uses it.
        After a scan is imported again into the same directory, runs of those conditions are
        unpaired with the runs made before. Import a changed scan into a new directory if you
        want to keep both.
      </P>

      <H3 id="manifest" mono>
        scene.json
      </H3>
      <CodeBlock lang="json" filename="scenes/cell-3/scene.json" code={manifest} />
      <DocTable
        caption="Fields of scene.json"
        head={["Field", "Meaning"]}
        rows={[
          ["version", "Manifest version. Must be 1."],
          ["source", "File name of the mesh that was imported."],
          ["visual", "File name of the visual mesh."],
          ["hulls", "File names of the convex collision pieces."],
          ["color", "Average color of the scan, RGB from 0 to 1."],
          ["extent_m", "Size of the scan along x, y and z, in meters."],
          ["scale", "The --scale that was applied."],
          ["up", "The --up that was applied."],
        ]}
      />

      <H3 id="preview">Checking the result</H3>
      <UL>
        <LI>
          <C>preview.png</C> is a 640 by 480 render of the scan from above and to the side.
          Check that the scan is the right way up, that the floor is at the bottom, and that
          it is what you scanned.
        </LI>
        <LI>
          <C>scene.xml</C> opens in a MuJoCo viewer. The convex pieces are in geom group 3,
          which viewers hide by default. Turn that group on to see the collision shape.
        </LI>
        <LI>
          Check the printed size against a dimension you know, such as the width of the
          table.
        </LI>
      </UL>

      <H2 id="use">Using the scan in a scenario</H2>
      <P>
        The <C>scanned_scene</C> perturbation adds the imported scene to a task as a static
        body. It is supported by <C>aloha/transfer_cube</C> and <C>aloha/insertion</C>.
      </P>
      <CodeBlock lang="yaml" filename="scenarios/cell-3.yaml" code={scenario} />
      <DocTable
        caption="Parameters of scanned_scene"
        head={["Parameter", "Type", "Default", "Meaning"]}
        rows={[
          ["path", "string", "required", "A scene directory produced by shakedown scan import."],
          [
            "position",
            "list of 3 numbers",
            "[0.0, 0.6, 0.0]",
            "Where the scan’s origin is placed in the task’s world frame (x, y, z), in meters.",
          ],
          [
            "yaw_deg",
            "number",
            "0.0",
            "Rotation of the scan about the vertical axis, in degrees.",
          ],
          [
            "collide",
            "boolean",
            "true",
            "Whether the robot and the objects can collide with the scan. With false only the visual mesh is added.",
          ],
          [
            "hide_surface",
            "boolean",
            "false",
            "Make the task’s own work surface invisible, for a scan that already contains one.",
          ],
        ]}
      />
      <UL>
        <LI>
          <Strong>Placement is manual.</Strong> Nothing aligns the scan with the robot. Choose{" "}
          <C>position</C> and <C>yaw_deg</C> so that the scanned table lies where the task’s
          table is, run a few episodes with <C>--videos all</C>, and look at the replay.
        </LI>
        <LI>
          <Strong>A relative path is resolved against the directory you run the command
          from</Strong>, not against the scenario file.
        </LI>
        <LI>
          <Strong>hide_surface hides, it does not remove.</Strong> The effect is visual
          only. The task’s work surface is no longer drawn, but it is still there: it still
          collides with the robot and the objects, and the task object still rests on it. If the scanned table is higher or lower than the task’s table, the
          images and the physics disagree.
        </LI>
        <LI>
          <Strong>A scan that overlaps the robot or the object at the start</Strong> is in
          collision with them from the first step. Use <C>collide: false</C> to test the
          visual effect alone.
        </LI>
        <LI>
          <Strong>Contacts are reported</Strong> as <C>robot:scene</C>,{" "}
          <C>gripper:scene</C> and <C>object:scene</C>, and can be asserted with{" "}
          <C>no_contact</C>, as in the example.
        </LI>
        <LI>
          <Strong>A missing or invalid scene directory</Strong> is reported by{" "}
          <C>shakedown validate</C>, and stops <C>shakedown run</C> before it loads the
          policy.
        </LI>
      </UL>
      <P>
        A scanned scene changes the whole image, so an unperturbed scenario is not its
        baseline in the usual sense. Treat a scenario with a scan as its own reference, and
        compare checkpoints on it with <C>--baseline</C>. The parameters are also listed in
        the <A href="/docs/perturbations#scanned_scene">perturbations reference</A>.
      </P>

      <H2 id="limits">Limits</H2>
      <P>A scan gives the shape of the surroundings and one color. Stated plainly:</P>
      <UL>
        <LI>
          <Strong>Textures are not carried over.</Strong> The scan is drawn in its average
          color. A policy that depends on the appearance of the background, such as a
          poster, a patterned floor or a colored bin, does not see it. This is the largest
          gap between a scanned scene and the real workcell.
        </LI>
        <LI>
          <Strong>No materials are recovered.</Strong> Reflective, transparent and glossy
          surfaces are drawn like any other. Friction of the scanned surfaces is the
          default of the task’s model.
        </LI>
        <LI>
          <Strong>No mass is recovered.</Strong> The scan is one static body. Nothing in it
          can be pushed, tipped or picked up.
        </LI>
        <LI>
          <Strong>No articulation is recovered.</Strong> A scanned drawer, door or clamp is
          solid and does not move.
        </LI>
        <LI>
          <Strong>Lighting is not recovered.</Strong> The scene keeps the lights of the task’s
          model.
        </LI>
        <LI>
          <Strong>Gaussian splat files are not accepted.</Strong> They are not meshes.
        </LI>
        <LI>
          <Strong>The scan is as good as the scanning app.</Strong> Holes, missing undersides
          and smoothed edges in the scan are holes, missing undersides and smoothed edges in
          the scene.
        </LI>
        <LI>
          <Strong>Tested with generated meshes only</Strong>, not yet with a real phone scan.
        </LI>
      </UL>
      <P>
        Used within these limits, a scanned scene tests whether a policy is disturbed by the
        geometry of its surroundings and whether its motions clear them. It does not make the
        simulated images look like the real camera’s. See{" "}
        <A href="/docs/limitations">Limitations</A>.
      </P>
    </DocPage>
  );
}
