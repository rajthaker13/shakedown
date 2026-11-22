/**
 * Reference data for every registered perturbation. Transcribed from
 * engine/src/shakedown/perturbations/sim.py and io.py, with behavior taken
 * from envs/mujoco_scene.py, envs/aloha.py and envs/pusht.py. `shakedown list`
 * prints the same names, kinds and defaults.
 */
export type Param = {
  name: string;
  type: string;
  default: string;
  range: string;
  meaning: string;
};

export type PerturbationDoc = {
  name: string;
  kind: "sim" | "io";
  /** The one-line summary the engine prints in `shakedown list`. */
  summary: string;
  /** The real-world fault or change this stands in for. */
  models: string;
  params: Param[];
  aloha: boolean;
  pusht: boolean | "partial";
  notes: string[];
  example: string;
};

const CAMERA: Param = {
  name: "camera",
  type: "string or null",
  default: "null",
  range: "a camera name",
  meaning: "Camera to affect. null affects every camera in the observation.",
};

export const simPerturbations: PerturbationDoc[] = [
  {
    name: "lighting",
    kind: "sim",
    summary: "Scene light intensity, ambient level and color tint.",
    models:
      "A workcell that is darker, brighter or lit with a different color than during data collection: a failed fixture, a night shift, sodium or tungsten lamps.",
    params: [
      {
        name: "intensity",
        type: "number",
        default: "1.0",
        range: "0 to 10",
        meaning: "Multiplier on the diffuse and specular output of every light. 1.0 is nominal.",
      },
      {
        name: "ambient",
        type: "number",
        default: "1.0",
        range: "0 to 10",
        meaning: "Multiplier on ambient light.",
      },
      {
        name: "tint",
        type: "list of 3 numbers",
        default: "[1.0, 1.0, 1.0]",
        range: "any",
        meaning: "Per-channel multiplier (red, green, blue) applied to all light.",
      },
    ],
    aloha: true,
    pusht: false,
    notes: [
      "Applies to every light in the scene and to the MuJoCo headlight.",
      "Light colors are clipped to the range 0 to 1 after scaling, so multipliers above 1 saturate.",
    ],
    example: `perturbations:
  - lighting: { intensity: 0.4, ambient: 0.4 }`,
  },
  {
    name: "camera_pose",
    kind: "sim",
    summary: "Camera bumped or remounted: translation, pan, tilt, roll, field of view.",
    models:
      "A camera whose mount was knocked, or that was remounted slightly away from where it was during data collection, or replaced with a lens of a different field of view.",
    params: [
      {
        name: "camera",
        type: "string",
        default: "top",
        range: "a camera in the scene",
        meaning: "Name of the simulated camera to move.",
      },
      {
        name: "translate_cm",
        type: "list of 3 numbers",
        default: "[0.0, 0.0, 0.0]",
        range: "any",
        meaning: "Translation (x, y, z) in the world frame, in centimeters.",
      },
      {
        name: "pan_deg",
        type: "number",
        default: "0.0",
        range: "any",
        meaning: "Rotation about the camera's up axis, in degrees.",
      },
      {
        name: "tilt_deg",
        type: "number",
        default: "0.0",
        range: "any",
        meaning: "Rotation about the camera's right axis, in degrees.",
      },
      {
        name: "roll_deg",
        type: "number",
        default: "0.0",
        range: "any",
        meaning: "Rotation about the viewing axis, in degrees.",
      },
      {
        name: "fov_delta_deg",
        type: "number",
        default: "0.0",
        range: "any",
        meaning: "Change in vertical field of view, in degrees.",
      },
    ],
    aloha: true,
    pusht: false,
    notes: [
      "The ALOHA policies see the camera named top. The replay's external view uses the camera named angle.",
      "A camera name that does not exist in the scene is reported by shakedown validate and stops shakedown run before it starts. The message lists the cameras the scene has.",
      "The resulting field of view is clipped to the range 5 to 170 degrees.",
      "A camera that tracks a body is first frozen at its nominal orientation. Otherwise tracking would re-aim it and hide the translation.",
      "A camera mounted on a moving body keeps moving with that body.",
    ],
    example: `perturbations:
  - camera_pose: { camera: top, pan_deg: 2, translate_cm: [1, 0, 0] }`,
  },
  {
    name: "object_pose",
    kind: "sim",
    summary: "Shift, rotate or jitter where the task object starts.",
    models:
      "Parts that arrive outside the area covered by the training data, or with more variation in position and orientation than the demonstrations had.",
    params: [
      {
        name: "offset_cm",
        type: "list of 2 numbers",
        default: "[0.0, 0.0]",
        range: "any",
        meaning: "Constant offset (x, y) from the nominal sampled position, in centimeters.",
      },
      {
        name: "jitter_cm",
        type: "number",
        default: "0.0",
        range: "0 or more",
        meaning:
          "Extra offset drawn per episode, uniformly from −jitter to +jitter on each axis, in centimeters.",
      },
      {
        name: "yaw_deg",
        type: "number",
        default: "0.0",
        range: "any",
        meaning: "Rotation about the vertical axis, in degrees.",
      },
      {
        name: "yaw_jitter_deg",
        type: "number",
        default: "0.0",
        range: "0 or more",
        meaning: "Extra yaw drawn per episode, uniformly from −jitter to +jitter, in degrees.",
      },
    ],
    aloha: true,
    pusht: true,
    notes: [
      "The nominal position is still sampled from the episode seed. The offset is added to it.",
      "The jitter is derived from the episode seed, so it is the same in every run of that seed.",
      "In aloha/insertion the same offset and yaw are applied to both the peg and the socket.",
      "In pusht one workspace unit is treated as one millimeter, so 1 cm moves the block 10 units. The block position is clipped to the range 40 to 472 units on each axis.",
    ],
    example: `perturbations:
  - object_pose: { offset_cm: [0, 6], yaw_jitter_deg: 15 }`,
  },
  {
    name: "object_appearance",
    kind: "sim",
    summary: "Task object color and size.",
    models:
      "A part of a different color or size than the one in the demonstrations, such as a new product variant.",
    params: [
      {
        name: "color",
        type: "list of 3 numbers or null",
        default: "null",
        range: "0 to 1 per channel",
        meaning: "RGB color of the task object. null keeps the original color.",
      },
      {
        name: "size_scale",
        type: "number",
        default: "1.0",
        range: "above 0, up to 5",
        meaning: "Multiplier on the size of the object's geometry.",
      },
    ],
    aloha: true,
    pusht: "partial",
    notes: [
      "In the ALOHA environments size_scale changes the simulated geometry, so it affects collisions and grasps as well as the image.",
      "pusht supports color only. A size_scale other than 1.0 is rejected when the scene is built, which shakedown validate and the check at the start of shakedown run both do.",
    ],
    example: `perturbations:
  - object_appearance: { color: [0.1, 0.3, 0.9] }`,
  },
  {
    name: "object_physics",
    kind: "sim",
    summary: "Task object mass and surface friction.",
    models:
      "A part made of a different material, a heavier or lighter part, or a dusty or oily surface that slips in the gripper.",
    params: [
      {
        name: "mass_scale",
        type: "number",
        default: "1.0",
        range: "above 0, up to 100",
        meaning: "Multiplier on the object's mass and inertia.",
      },
      {
        name: "friction_scale",
        type: "number",
        default: "1.0",
        range: "above 0, up to 100",
        meaning: "Multiplier on the object's friction coefficients.",
      },
    ],
    aloha: true,
    pusht: true,
    notes: [],
    example: `perturbations:
  - object_physics: { mass_scale: 3.0, friction_scale: 0.3 }`,
  },
  {
    name: "surface_appearance",
    kind: "sim",
    summary: "Work surface color.",
    models: "A table, mat or fixture plate of a different color than in the demonstrations.",
    params: [
      {
        name: "color",
        type: "list of 3 numbers",
        default: "[0.2, 0.2, 0.2]",
        range: "0 to 1 per channel",
        meaning: "RGB color of the work surface.",
      },
    ],
    aloha: true,
    pusht: false,
    notes: [
      "The surface's material is detached so that the color takes effect. Any texture on the surface is lost.",
      "Listing surface_appearance with no parameters changes the surface to dark gray. It is not a no-op.",
    ],
    example: `perturbations:
  - surface_appearance: { color: [0.8, 0.8, 0.75] }`,
  },
  {
    name: "distractors",
    kind: "sim",
    summary: "Extra objects placed on the work surface.",
    models: "Tools, parts or packaging left on the work surface that were not in the training data.",
    params: [
      {
        name: "count",
        type: "integer",
        default: "3",
        range: "1 to 20",
        meaning: "Number of distractor objects.",
      },
      {
        name: "shape",
        type: "string",
        default: "mixed",
        range: "box, sphere, cylinder, mixed",
        meaning: "Shape of every distractor. mixed picks a shape for each one.",
      },
      {
        name: "color",
        type: "list of 3 numbers or null",
        default: "null",
        range: "0 to 1 per channel",
        meaning: "RGB color of every distractor. null picks each color from a fixed palette.",
      },
      {
        name: "size_cm",
        type: "number",
        default: "2.0",
        range: "above 0, up to 20",
        meaning: "Half-size of each distractor, in centimeters.",
      },
      {
        name: "layout_seed",
        type: "integer",
        default: "0",
        range: "any",
        meaning: "Seed for positions, shapes and colors.",
      },
    ],
    aloha: true,
    pusht: false,
    notes: [
      "For given parameters the layout depends only on layout_seed. It is the same in every episode and every run.",
      "Distractors are static bodies. They are placed without overlapping each other, and clear of the task object's spawn area and the arm bases.",
      "When the objects cannot be placed without overlap, shakedown validate reports it and shakedown run stops before it starts. Lower count or size_cm.",
      "Contacts with distractors are reported as robot:distractor, gripper:distractor and object:distractor.",
    ],
    example: `perturbations:
  - distractors: { count: 4, shape: mixed, layout_seed: 3 }`,
  },
  {
    name: "actuator_gain",
    kind: "sim",
    summary: "Position controller stiffness, as from different or worn motors.",
    models:
      "Worn motors, or a second robot of the same model whose joints track commands more softly or more stiffly.",
    params: [
      {
        name: "scale",
        type: "number",
        default: "1.0",
        range: "above 0, up to 10",
        meaning: "Multiplier on the proportional gain of every position actuator.",
      },
    ],
    aloha: true,
    pusht: false,
    notes: [],
    example: `perturbations:
  - actuator_gain: { scale: 0.5 }`,
  },
  {
    name: "joint_damping",
    kind: "sim",
    summary: "Joint damping, as from temperature or wear.",
    models: "Joints that move more or less freely because of temperature, lubrication or wear.",
    params: [
      {
        name: "scale",
        type: "number",
        default: "1.0",
        range: "0 to 100",
        meaning:
          "Multiplier on the damping of every hinge and slide joint. Has no effect on a joint modeled with no damping.",
      },
      {
        name: "add",
        type: "number",
        default: "0.0",
        range: "0 to 1000",
        meaning: "Damping added to every hinge and slide joint after scaling, in N·m·s/rad.",
      },
    ],
    aloha: true,
    pusht: false,
    notes: [
      "The resulting damping of each joint is its original damping times scale, plus add.",
      "The ALOHA model bundled with gym-aloha has zero damping on every joint. In the ALOHA environments scale alone therefore changes nothing. Use add.",
      "The same value is added to every hinge and slide joint of the model. There is no per-joint setting.",
    ],
    example: `perturbations:
  - joint_damping: { add: 0.5 }`,
  },
  {
    name: "scanned_scene",
    kind: "sim",
    summary: "Surround the task with a scan of a real workcell.",
    models:
      "The surroundings of your own workcell: walls, fixtures, shelving and clutter that the policy's camera sees and the arms can hit, in place of the empty background of the built-in scene.",
    params: [
      {
        name: "path",
        type: "string",
        default: "required",
        range: "a scene directory",
        meaning: "A scene directory produced by shakedown scan import.",
      },
      {
        name: "position",
        type: "list of 3 numbers",
        default: "[0.0, 0.6, 0.0]",
        range: "any",
        meaning: "Where the scan's origin is placed in the task's world frame (x, y, z), in meters.",
      },
      {
        name: "yaw_deg",
        type: "number",
        default: "0.0",
        range: "any",
        meaning: "Rotation of the scan about the vertical axis, in degrees.",
      },
      {
        name: "collide",
        type: "boolean",
        default: "true",
        range: "true or false",
        meaning: "Whether the robot and the objects can collide with the scan.",
      },
      {
        name: "hide_surface",
        type: "boolean",
        default: "false",
        range: "true or false",
        meaning: "Make the task's own work surface invisible, for a scan that already contains one.",
      },
    ],
    aloha: true,
    pusht: false,
    notes: [
      "The scan's origin is the center of its footprint, at floor level. shakedown scan import puts it there.",
      "A relative path is resolved against the directory the command is run from, not against the scenario file.",
      "The scan is a static body drawn in one color, the average color of the scan. Textures are not carried over.",
      "hide_surface changes what is drawn only. The task's work surface still takes part in collisions.",
      "Contacts with the scan are reported as robot:scene, gripper:scene and object:scene. With collide: false there are none.",
      "A path that is not an imported scene is reported by shakedown validate and stops shakedown run before it starts.",
      "The fingerprint contains a hash of the scene's files. Re-importing a scan into the same directory makes later runs unpaired with earlier ones.",
    ],
    example: `perturbations:
  - scanned_scene: { path: scenes/cell-3, position: [0, 0.6, 0], yaw_deg: 90 }`,
  },
];

export const ioPerturbations: PerturbationDoc[] = [
  {
    name: "image_noise",
    kind: "io",
    summary: "Additive Gaussian sensor noise on camera images.",
    models: "Sensor noise from high gain in low light, or from a cheaper camera.",
    params: [
      {
        name: "std",
        type: "number",
        default: "10.0",
        range: "0 to 255",
        meaning: "Standard deviation of the noise, on the 0 to 255 pixel scale.",
      },
      CAMERA,
    ],
    aloha: true,
    pusht: true,
    notes: ["Noise is drawn independently for every pixel, channel and step."],
    example: `perturbations:
  - image_noise: { std: 20 }`,
  },
  {
    name: "image_adjust",
    kind: "io",
    summary: "Exposure change: brightness, contrast and gamma.",
    models: "A camera whose exposure, gain or tone curve is set differently than during data collection.",
    params: [
      {
        name: "brightness",
        type: "number",
        default: "1.0",
        range: "0 to 5",
        meaning: "Multiplier on pixel intensity.",
      },
      {
        name: "contrast",
        type: "number",
        default: "1.0",
        range: "0 to 5",
        meaning: "Multiplier on the distance of each pixel from mid-gray.",
      },
      {
        name: "gamma",
        type: "number",
        default: "1.0",
        range: "above 0, up to 5",
        meaning: "Exponent applied to intensity on the 0 to 1 scale.",
      },
      CAMERA,
    ],
    aloha: true,
    pusht: true,
    notes: [
      "Applied in this order: brightness, contrast, clipping to the valid range, gamma.",
      "This changes the image only. To change the light in the scene, which also changes shadows and highlights, use lighting.",
    ],
    example: `perturbations:
  - image_adjust: { brightness: 0.6, gamma: 1.4 }`,
  },
  {
    name: "image_blur",
    kind: "io",
    summary: "Gaussian blur, as from a defocused or smudged lens.",
    models: "A lens that is out of focus, smudged or fogged.",
    params: [
      {
        name: "radius_px",
        type: "number",
        default: "2.0",
        range: "0 to 50",
        meaning: "Radius of the Gaussian blur, in pixels of the observation image.",
      },
      CAMERA,
    ],
    aloha: true,
    pusht: true,
    notes: [
      "The radius is in pixels, so the same value is a much stronger blur on the 96 by 96 pusht image than on a 480 by 640 ALOHA image.",
    ],
    example: `perturbations:
  - image_blur: { radius_px: 3 }`,
  },
  {
    name: "image_occlusion",
    kind: "io",
    summary: "A solid patch covering part of the image.",
    models: "Something blocking part of the view: a cable, a sticker, dirt on the lens, a person's arm.",
    params: [
      {
        name: "center",
        type: "list of 2 numbers",
        default: "[0.5, 0.5]",
        range: "fractions of the image",
        meaning: "Center of the patch as a fraction of width and height.",
      },
      {
        name: "size",
        type: "list of 2 numbers",
        default: "[0.2, 0.2]",
        range: "fractions of the image",
        meaning: "Size of the patch as a fraction of width and height.",
      },
      {
        name: "color",
        type: "list of 3 integers",
        default: "[0, 0, 0]",
        range: "0 to 255 per channel",
        meaning: "RGB color of the patch.",
      },
      CAMERA,
    ],
    aloha: true,
    pusht: true,
    notes: [
      "The patch is fixed in the image. It does not move with the scene.",
      "This color is on the 0 to 255 scale. The colors of sim perturbations are on the 0 to 1 scale.",
    ],
    example: `perturbations:
  - image_occlusion: { center: [0.3, 0.6], size: [0.15, 0.15] }`,
  },
  {
    name: "image_compression",
    kind: "io",
    summary: "JPEG artifacts, as from a compressed camera stream.",
    models: "A camera stream that is compressed before it reaches the policy, for example over a network.",
    params: [
      {
        name: "quality",
        type: "integer",
        default: "30",
        range: "1 to 100",
        meaning: "JPEG quality. Lower values give stronger artifacts.",
      },
      CAMERA,
    ],
    aloha: true,
    pusht: true,
    notes: ["Each frame is encoded to JPEG and decoded again."],
    example: `perturbations:
  - image_compression: { quality: 20 }`,
  },
  {
    name: "frame_drop",
    kind: "io",
    summary: "Camera frames are dropped and the previous frame is repeated.",
    models: "A camera driver or link that loses frames, so the policy sees a stale image.",
    params: [
      {
        name: "probability",
        type: "number",
        default: "0.1",
        range: "0 to 1",
        meaning: "Chance at each step that the frame is dropped.",
      },
      CAMERA,
    ],
    aloha: true,
    pusht: true,
    notes: [
      "A dropped frame is replaced by the last frame that was delivered. Consecutive drops repeat the same frame.",
      "The first frame of an episode is never dropped.",
      "With several cameras, each camera drops frames independently.",
    ],
    example: `perturbations:
  - frame_drop: { probability: 0.2 }`,
  },
  {
    name: "proprio_noise",
    kind: "io",
    summary: "Noise and constant bias on joint state, as from encoder error.",
    models: "Encoder noise, or a joint whose zero position was calibrated with an offset.",
    params: [
      {
        name: "std",
        type: "number",
        default: "0.01",
        range: "0 or more",
        meaning: "Standard deviation of Gaussian noise, in the units of the state vector.",
      },
      {
        name: "bias",
        type: "number",
        default: "0.0",
        range: "any",
        meaning: "Constant offset, in the units of the state vector.",
      },
    ],
    aloha: true,
    pusht: true,
    notes: [
      "Noise and bias are added to every dimension of the state vector. There is no per-joint setting.",
      "The units are those of the environment's state. For ALOHA that is joint positions in radians plus normalized gripper positions. For pusht it is the agent position in workspace units, where 0.01 is negligible.",
    ],
    example: `perturbations:
  - proprio_noise: { std: 0.02, bias: 0.01 }`,
  },
  {
    name: "action_latency",
    kind: "io",
    summary: "Actions reach the robot a fixed number of control steps late.",
    models: "Delay between inference and actuation, as when the policy runs on a remote server.",
    params: [
      {
        name: "steps",
        type: "integer",
        default: "2",
        range: "0 to 200",
        meaning: "Delay in control steps.",
      },
    ],
    aloha: true,
    pusht: true,
    notes: [
      "One control step is 20 ms in the ALOHA environments (50 Hz) and 100 ms in pusht (10 Hz).",
      "Until the first delayed action arrives, the robot holds the first action the policy commanded.",
      "The policy still receives a fresh observation at every step. Only the action channel is delayed.",
      "The delay is a simple queue. When the policy plans again, its observation does not yet reflect the actions still in the queue. Without the latency_compensation option of the policy, results describe a deployment that makes no correction for its delay.",
    ],
    example: `perturbations:
  - action_latency: { steps: 5 }`,
  },
  {
    name: "action_noise",
    kind: "io",
    summary: "Gaussian noise on commanded actions.",
    models: "Imprecise actuation: commands that are executed with a small random error.",
    params: [
      {
        name: "std",
        type: "number",
        default: "0.01",
        range: "0 or more",
        meaning: "Standard deviation of the noise, in the units of the action vector.",
      },
    ],
    aloha: true,
    pusht: true,
    notes: [
      "Noise is added to every action dimension. For pusht, actions are positions in workspace units from 0 to 512, where 0.01 is negligible.",
    ],
    example: `perturbations:
  - action_noise: { std: 0.02 }`,
  },
  {
    name: "action_hold",
    kind: "io",
    summary: "Commands are lost and the robot repeats its previous action.",
    models: "A lossy link between the policy and the controller. A lost command leaves the robot executing the last one it received.",
    params: [
      {
        name: "probability",
        type: "number",
        default: "0.1",
        range: "0 to 1",
        meaning: "Chance at each step that the command is lost.",
      },
    ],
    aloha: true,
    pusht: true,
    notes: ["The first action of an episode is never lost."],
    example: `perturbations:
  - action_hold: { probability: 0.15 }`,
  },
];

export const allPerturbations: PerturbationDoc[] = [...simPerturbations, ...ioPerturbations];
