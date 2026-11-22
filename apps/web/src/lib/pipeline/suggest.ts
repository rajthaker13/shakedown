/**
 * Turn what robots report from the field into proposed tests.
 *
 * Every rule here compares a condition measured on the robot with the range
 * the project's suite already covers. A suggestion is made only when the
 * field is outside that range, and it states the measurement it came from.
 */

export type Measured = {
  action_delay_ms?: number;
  inference_ms?: number;
  control_hz?: number;
  image_brightness?: number;
  frames_dropped?: number;
};

export type FieldRow = {
  success: boolean;
  steps: number | null;
  measured: Measured;
};

export type Covered = {
  env: string;
  /** Control rate of the environment the suite runs in. */
  controlHz: number;
  maxLatencySteps: number;
  maxFrameDrop: number;
  minBrightness: number;
  maxBrightness: number;
};

export type Suggestion = {
  fingerprint: string;
  title: string;
  rationale: string;
  yaml: string;
  evidence: Record<string, number | string>;
};

const MIN_REPORTS = 10;

export function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return NaN;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function numbers(rows: FieldRow[], pick: (m: Measured) => number | undefined): number[] {
  return rows
    .map((r) => pick(r.measured))
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

function header(name: string, description: string, env: string): string {
  return [
    "version: 1",
    `name: ${name}`,
    `description: ${description}`,
    `env: ${env}`,
    "episodes: 50",
    "seed: 1000",
  ].join("\n");
}

/** Walk the perturbations of a suite's conditions to find what it already covers. */
export function coverage(
  conditions: { env: string; perturbations: unknown }[],
  controlHz = 50,
): Covered {
  const covered: Covered = {
    env: conditions[0]?.env ?? "",
    controlHz,
    maxLatencySteps: 0,
    maxFrameDrop: 0,
    minBrightness: 1,
    maxBrightness: 1,
  };
  for (const condition of conditions) {
    if (!Array.isArray(condition.perturbations)) continue;
    for (const entry of condition.perturbations as Record<string, Record<string, unknown>>[]) {
      const [name, params] = Object.entries(entry ?? {})[0] ?? [];
      if (!name || !params) continue;
      const value = (key: string) => (typeof params[key] === "number" ? (params[key] as number) : undefined);
      if (name === "action_latency") {
        covered.maxLatencySteps = Math.max(covered.maxLatencySteps, value("steps") ?? 0);
      } else if (name === "frame_drop") {
        covered.maxFrameDrop = Math.max(covered.maxFrameDrop, value("probability") ?? 0);
      } else if (name === "image_adjust") {
        const b = value("brightness") ?? 1;
        covered.minBrightness = Math.min(covered.minBrightness, b);
        covered.maxBrightness = Math.max(covered.maxBrightness, b);
      } else if (name === "lighting") {
        const b = value("intensity") ?? 1;
        covered.minBrightness = Math.min(covered.minBrightness, b);
        covered.maxBrightness = Math.max(covered.maxBrightness, b);
      }
    }
  }
  return covered;
}

export function suggest(rows: FieldRow[], covered: Covered): Suggestion[] {
  const out: Suggestion[] = [];
  if (!covered.env) return out;

  // Delay between choosing an action and the robot receiving it.
  const delays = numbers(rows, (m) => m.action_delay_ms ?? m.inference_ms);
  if (delays.length >= MIN_REPORTS) {
    const hz = quantile(numbers(rows, (m) => m.control_hz), 0.5) || covered.controlHz;
    const toSteps = (ms: number) => Math.max(1, Math.round((ms / 1000) * hz));
    const typical = toSteps(quantile(delays, 0.5));
    const high = toSteps(quantile(delays, 0.9));
    if (high > covered.maxLatencySteps) {
      const values = [...new Set([typical, high])].sort((a, b) => a - b);
      out.push({
        // Coarse on purpose: a proposal that was dismissed should not return because the
        // measurement moved by one step.
        fingerprint: `latency:${Math.ceil(high / 5) * 5}`,
        title: `Test action delay up to ${Math.round(quantile(delays, 0.9))} ms`,
        rationale:
          `Robots report a delay of ${Math.round(quantile(delays, 0.5))} ms typically and ` +
          `${Math.round(quantile(delays, 0.9))} ms at the 90th percentile, which is ${high} control steps at ` +
          `${Math.round(hz)} Hz. The suite tests up to ${covered.maxLatencySteps} step(s).`,
        yaml: [
          header(
            "field-latency",
            "Action delay as measured on robots in the field.",
            covered.env,
          ),
          "sweep:",
          "  name: steps",
          `  values: [${values.join(", ")}]`,
          "perturbations:",
          '  - action_latency: { steps: "${steps}" }',
          "tags: [timing, from-field]",
          "",
        ].join("\n"),
        evidence: {
          reports: delays.length,
          p50_ms: Math.round(quantile(delays, 0.5)),
          p90_ms: Math.round(quantile(delays, 0.9)),
          control_hz: Math.round(hz),
          covered_steps: covered.maxLatencySteps,
        },
      });
    }
  }

  // Camera frames that never arrived.
  const drops = rows
    .filter((r) => typeof r.measured.frames_dropped === "number" && (r.steps ?? 0) > 0)
    .map((r) => (r.measured.frames_dropped as number) / (r.steps as number));
  if (drops.length >= MIN_REPORTS) {
    const high = Math.min(1, quantile(drops, 0.9));
    if (high > 0.01 && high > covered.maxFrameDrop) {
      const probability = Math.round(high * 100) / 100;
      out.push({
        fingerprint: `frame-drop:${Math.ceil(probability * 20) / 20}`,
        title: `Test ${Math.round(high * 100)}% dropped camera frames`,
        rationale:
          `At the 90th percentile, robots lose ${Math.round(high * 100)}% of camera frames in an episode. ` +
          `The suite tests up to ${Math.round(covered.maxFrameDrop * 100)}%.`,
        yaml: [
          header("field-frame-drop", "Dropped camera frames as measured in the field.", covered.env),
          "perturbations:",
          `  - frame_drop: { probability: ${probability} }`,
          "tags: [sensor, from-field]",
          "",
        ].join("\n"),
        evidence: { reports: drops.length, p90_rate: probability, covered: covered.maxFrameDrop },
      });
    }
  }

  // Exposure: are failures happening in darker or brighter images than successes?
  const bright = (ok: boolean) =>
    numbers(
      rows.filter((r) => r.success === ok),
      (m) => m.image_brightness,
    );
  const wins = bright(true);
  const losses = bright(false);
  if (wins.length >= MIN_REPORTS && losses.length >= MIN_REPORTS) {
    const ratio = quantile(losses, 0.5) / quantile(wins, 0.5);
    const outside = ratio < covered.minBrightness - 0.05 || ratio > covered.maxBrightness + 0.05;
    if (Number.isFinite(ratio) && Math.abs(ratio - 1) > 0.15 && outside) {
      const brightness = Math.round(ratio * 100) / 100;
      out.push({
        fingerprint: `brightness:${Math.round(brightness * 10) / 10}`,
        title: `Test images ${ratio < 1 ? "darker" : "brighter"} by ${Math.round(Math.abs(ratio - 1) * 100)}%`,
        rationale:
          `Failed episodes had a median image brightness of ${Math.round(quantile(losses, 0.5))}, ` +
          `against ${Math.round(quantile(wins, 0.5))} for successful ones. This is an association, ` +
          `not a cause: a test will show whether brightness alone makes the policy fail.`,
        yaml: [
          header("field-exposure", "Image brightness seen in failed field episodes.", covered.env),
          "perturbations:",
          `  - image_adjust: { brightness: ${brightness} }`,
          "tags: [vision, from-field]",
          "",
        ].join("\n"),
        evidence: {
          failures: losses.length,
          successes: wins.length,
          failed_median: Math.round(quantile(losses, 0.5)),
          succeeded_median: Math.round(quantile(wins, 0.5)),
        },
      });
    }
  }
  return out;
}
