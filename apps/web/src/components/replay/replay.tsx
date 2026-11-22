"use client";

import { ChevronLeft, ChevronRight, Flag, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Kbd } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export type ReplayTrace = {
  steps: number;
  fps: number;
  signals: Record<string, number[]>;
  contacts: Record<string, number>;
  firstDivergenceStep: number | null;
};

const SPEEDS = [0.25, 0.5, 1, 2, 4];

/** Signals are shown in this order when present; anything else follows alphabetically. */
const ORDER = [
  "reward",
  "action_divergence",
  "action_change",
  "coverage",
  "object_height_m",
  "right_gripper_to_object_m",
  "left_gripper_to_object_m",
];

const LABELS: Record<string, { label: string; help: string; unit?: string }> = {
  reward: { label: "Task stage", help: "Reward reported by the environment. The maximum means the task is complete." },
  action_divergence: {
    label: "Divergence from nominal",
    help: "How far the commanded action is from the same policy on the same seed without perturbations, as a fraction of each joint's nominal range.",
  },
  action_change: { label: "Action change", help: "Size of the change between consecutive actions. Spikes are abrupt corrections." },
  coverage: { label: "Target coverage", help: "Fraction of the target covered by the block." },
  object_height_m: { label: "Object height", help: "Height of the task object above the table.", unit: "m" },
  right_gripper_to_object_m: { label: "Right gripper to object", help: "Distance between the right gripper and the object.", unit: "m" },
  left_gripper_to_object_m: { label: "Left gripper to object", help: "Distance between the left gripper and the object.", unit: "m" },
};

function titleCase(name: string) {
  const text = name.replace(/_m$|_mm$/, "").replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)));
}

function path(values: number[], total: number, min: number, max: number, width: number, height: number) {
  if (!values.length) return "";
  const span = max - min || 1;
  const pad = 4;
  // Long episodes are thinned to about one point per pixel.
  const stride = Math.max(1, Math.floor(values.length / width));
  let d = "";
  for (let i = 0; i < values.length; i += stride) {
    const x = (i / Math.max(1, total - 1)) * width;
    const y = pad + (1 - (values[i] - min) / span) * (height - pad * 2);
    d += `${d ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return d;
}

export function Replay({
  videoSrc,
  trace,
  nominal,
  success,
}: {
  videoSrc: string | null;
  trace: ReplayTrace;
  /** Signals from the same seed with no perturbations, drawn behind for reference. */
  nominal: Record<string, number[]> | null;
  success: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(() => Math.max(0, (trace.firstDivergenceStep ?? 0) - 5));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [videoFailed, setVideoFailed] = useState(false);
  const last = Math.max(0, trace.steps - 1);
  const hasVideo = Boolean(videoSrc) && !videoFailed;

  const names = useMemo(() => {
    const present = Object.keys(trace.signals).filter((k) => trace.signals[k]?.length);
    const known = ORDER.filter((k) => present.includes(k));
    const rest = present.filter((k) => !ORDER.includes(k)).sort();
    return [...known, ...rest];
  }, [trace.signals]);

  const seek = useCallback(
    (next: number) => {
      const clamped = Math.min(last, Math.max(0, Math.round(next)));
      setStep(clamped);
      if (video.current && hasVideo) video.current.currentTime = clamped / trace.fps;
    },
    [last, trace.fps, hasVideo],
  );

  // Without a video the timeline drives itself.
  useEffect(() => {
    if (hasVideo || !playing) return;
    const started = performance.now();
    const from = step;
    let frame = 0;
    const tick = (now: number) => {
      const next = from + ((now - started) / 1000) * trace.fps * speed;
      if (next >= last) {
        setStep(last);
        setPlaying(false);
        return;
      }
      setStep(Math.round(next));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // The starting step is captured once per play, on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasVideo, playing, speed, trace.fps, last]);

  useEffect(() => {
    const el = video.current;
    if (!el || !hasVideo) return;
    el.playbackRate = speed;
    if (playing) void el.play().catch(() => setPlaying(false));
    else el.pause();
  }, [playing, speed, hasVideo]);

  // Land on the point of interest once the video can seek.
  const initial = useRef(step);
  function onLoaded() {
    if (video.current) video.current.currentTime = initial.current / trace.fps;
  }

  const toggle = useCallback(() => {
    if (step >= last) seek(0);
    setPlaying((p) => !p);
  }, [step, last, seek]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (document.querySelector("dialog[open]")) return;
      const jump = event.shiftKey ? 10 : 1;
      if (event.key === " ") {
        event.preventDefault();
        toggle();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPlaying(false);
        seek(step - jump);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setPlaying(false);
        seek(step + jump);
      } else if (event.key.toLowerCase() === "d" && trace.firstDivergenceStep != null) {
        setPlaying(false);
        seek(trace.firstDivergenceStep);
      } else if (/^[1-5]$/.test(event.key)) {
        setSpeed(SPEEDS[Number(event.key) - 1]);
      } else if (event.key.toLowerCase() === "f" && video.current) {
        void video.current.requestFullscreen?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seek, step, toggle, trace.firstDivergenceStep]);

  function stepFromPointer(clientX: number) {
    const box = track.current?.getBoundingClientRect();
    if (!box) return step;
    return ((clientX - box.left) / box.width) * last;
  }

  const position = last ? (step / last) * 100 : 0;
  const divergence = trace.firstDivergenceStep;
  const divergencePos = divergence != null && last ? (divergence / last) * 100 : null;
  const events = Object.entries(trace.contacts).sort((a, b) => a[1] - b[1]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* Video */}
        <div className="overflow-hidden rounded-md border border-line bg-inset">
          {hasVideo ? (
            <div className="relative">
              <video
                ref={video}
                src={videoSrc ?? undefined}
                muted
                playsInline
                preload="auto"
                onLoadedMetadata={onLoaded}
                onTimeUpdate={(e) =>
                  setStep(Math.min(last, Math.round(e.currentTarget.currentTime * trace.fps)))
                }
                onEnded={() => setPlaying(false)}
                onError={() => setVideoFailed(true)}
                aria-label="Episode replay. Left: what the policy saw. Right: external view."
                className="block aspect-[8/3] w-full bg-inset object-contain"
              />
              <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between p-2 text-[11px] font-medium uppercase tracking-[0.06em] text-fg">
                <span className="rounded-xs bg-inset/80 px-1.5 py-0.5">Policy input</span>
                <span className="rounded-xs bg-inset/80 px-1.5 py-0.5">External view</span>
              </div>
              <div className="pointer-events-none absolute bottom-2 left-2 rounded-xs bg-inset/80 px-1.5 py-0.5 font-mono text-[11px] tabular text-fg">
                step {step} · {(step / trace.fps).toFixed(2)}s
              </div>
            </div>
          ) : (
            <div className="flex aspect-[8/3] w-full flex-col items-center justify-center gap-1 px-6 text-center">
              <p className="text-[13px] text-fg-secondary">No video was recorded for this episode.</p>
              <p className="max-w-md text-xs text-fg-tertiary">
                By default the engine records failures, up to eight per condition, and one success.
                Run with <span className="font-mono">--videos all</span> to record every episode.
                The signals below are complete.
              </p>
            </div>
          )}
        </div>

        {/* Values at the cursor */}
        <div className="rounded-md border border-line bg-surface">
          <div className="flex h-9 items-center justify-between border-b border-line-subtle px-3">
            <h2 className="label-caps">At step {step}</h2>
            <span className="font-mono text-[11px] tabular text-fg-tertiary">
              {(step / trace.fps).toFixed(2)}s
            </span>
          </div>
          <dl className="flex flex-col divide-y divide-line-subtle">
            {names.map((name) => {
              const value = trace.signals[name]?.[Math.min(step, trace.signals[name].length - 1)];
              const ref = nominal?.[name]?.[Math.min(step, (nominal[name]?.length ?? 1) - 1)];
              return (
                <div key={name} className="flex items-center justify-between gap-3 px-3 py-1.5">
                  <dt className="truncate text-xs text-fg-secondary">
                    {LABELS[name]?.label ?? titleCase(name)}
                  </dt>
                  <dd className="shrink-0 font-mono text-xs tabular text-fg">
                    {value == null ? "–" : value.toFixed(3)}
                    {ref != null && name !== "action_divergence" ? (
                      <span className="ml-1.5 text-fg-tertiary" title="Nominal run, same seed">
                        ({ref.toFixed(3)})
                      </span>
                    ) : null}
                  </dd>
                </div>
              );
            })}
          </dl>
          {events.length ? (
            <div className="border-t border-line-subtle px-3 py-2">
              <h3 className="label-caps mb-1">First contact</h3>
              <ul className="flex flex-col gap-0.5">
                {events.map(([group, at]) => (
                  <li key={group}>
                    <button
                      type="button"
                      onClick={() => seek(at)}
                      className="flex w-full items-center justify-between rounded-xs py-0.5 text-xs text-fg-secondary hover:text-fg"
                    >
                      <span className="font-mono">{group.replace(":", " ↔ ")}</span>
                      <span className="font-mono tabular text-fg-tertiary">step {at}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {/* Transport */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              seek(step - 1);
            }}
            aria-label="Back one step"
            className="inline-flex size-8 items-center justify-center rounded-sm text-fg-secondary transition-colors duration-100 hover:bg-raised hover:text-fg"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="inline-flex size-8 items-center justify-center rounded-sm bg-accent text-on-accent transition-colors duration-100 hover:bg-accent-hover"
          >
            {playing ? (
              <Pause aria-hidden="true" className="size-4" fill="currentColor" />
            ) : (
              <Play aria-hidden="true" className="size-4" fill="currentColor" />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              seek(step + 1);
            }}
            aria-label="Forward one step"
            className="inline-flex size-8 items-center justify-center rounded-sm text-fg-secondary transition-colors duration-100 hover:bg-raised hover:text-fg"
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        </div>

        <div role="radiogroup" aria-label="Playback speed" className="flex items-center gap-0.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={speed === s}
              onClick={() => setSpeed(s)}
              className={cn(
                "h-7 rounded-xs px-1.5 font-mono text-[11px] tabular transition-colors duration-100",
                speed === s ? "bg-active text-fg" : "text-fg-tertiary hover:text-fg",
              )}
            >
              {s}×
            </button>
          ))}
        </div>

        {divergence != null ? (
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              seek(divergence);
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-fail-line bg-fail-subtle px-2 text-xs text-fail transition-colors duration-100 hover:border-fail"
          >
            <Flag aria-hidden="true" className="size-3" />
            Diverged at step {divergence}
            <Kbd>D</Kbd>
          </button>
        ) : null}

        <p className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-tertiary">
          <span className="flex items-center gap-1">
            <Kbd>Space</Kbd> play
          </span>
          <span className="flex items-center gap-1">
            <Kbd>←</Kbd>
            <Kbd>→</Kbd> step
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Shift</Kbd> ×10
          </span>
        </p>
      </div>

      {/* Timeline */}
      <div className="rounded-md border border-line bg-surface">
        <div className="grid grid-cols-[180px_minmax(0,1fr)] max-md:grid-cols-[110px_minmax(0,1fr)]">
          <div className="border-b border-r border-line-subtle px-3 py-2">
            <span className="label-caps">Signal</span>
          </div>
          <div className="relative border-b border-line-subtle px-0 py-2">
            <div className="flex justify-between px-1 font-mono text-[10px] tabular text-fg-tertiary">
              <span>0</span>
              <span>{Math.round(last / 2)}</span>
              <span>{last}</span>
            </div>
          </div>

          <div className="contents">
            <div className="flex flex-col border-r border-line-subtle">
              {names.map((name) => (
                <div
                  key={name}
                  title={LABELS[name]?.help}
                  className="flex h-12 flex-col justify-center border-b border-line-subtle px-3 last:border-0"
                >
                  <span className="truncate text-xs text-fg-secondary">
                    {LABELS[name]?.label ?? titleCase(name)}
                  </span>
                  {LABELS[name]?.unit ? (
                    <span className="text-[10px] text-fg-tertiary">{LABELS[name].unit}</span>
                  ) : null}
                </div>
              ))}
            </div>

            <div
              ref={track}
              role="slider"
              tabIndex={0}
              aria-label="Episode timeline"
              aria-valuemin={0}
              aria-valuemax={last}
              aria-valuenow={step}
              aria-valuetext={`Step ${step} of ${last}`}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setPlaying(false);
                seek(stepFromPointer(event.clientX));
              }}
              onPointerMove={(event) => {
                if (event.buttons & 1) seek(stepFromPointer(event.clientX));
              }}
              className="relative cursor-ew-resize touch-none select-none"
            >
              {divergencePos != null ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-0 bg-fail-subtle/30"
                  style={{ left: `${divergencePos}%` }}
                />
              ) : null}

              {names.map((name) => (
                <Track
                  key={name}
                  values={trace.signals[name]}
                  reference={name === "action_divergence" ? undefined : nominal?.[name]}
                  total={trace.steps}
                />
              ))}

              {divergencePos != null ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 w-px bg-fail-solid"
                  style={{ left: `${divergencePos}%` }}
                />
              ) : null}
              {events.map(([group, at]) => (
                <div
                  key={group}
                  aria-hidden="true"
                  title={`${group} at step ${at}`}
                  className="pointer-events-none absolute top-0 h-2 w-px bg-warn-solid"
                  style={{ left: `${last ? (at / last) * 100 : 0}%` }}
                />
              ))}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 w-px bg-accent"
                style={{ left: `${position}%` }}
              >
                <span className="absolute -left-[3px] -top-1 size-[7px] rounded-full bg-accent" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line-subtle px-3 py-2 text-[11px] text-fg-tertiary">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-info" />
            this episode
          </span>
          {nominal ? (
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-fg-tertiary" />
              same seed, no perturbation
            </span>
          ) : null}
          {divergence != null ? (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-px bg-fail-solid" />
              first sustained divergence
            </span>
          ) : null}
          {!success && divergence == null ? (
            <span>No sustained divergence from the nominal run was detected.</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Track({
  values,
  reference,
  total,
}: {
  values: number[];
  reference?: number[];
  total: number;
}) {
  const width = 1000;
  const height = 48;
  const { min, max } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const series of [values, reference ?? []]) {
      for (const v of series) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    if (!Number.isFinite(lo)) return { min: 0, max: 1 };
    return { min: Math.min(lo, 0), max: hi === lo ? lo + 1 : hi };
  }, [values, reference]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className="block h-12 w-full border-b border-line-subtle last:border-0"
    >
      {reference?.length ? (
        <path
          d={path(reference, total, min, max, width, height)}
          fill="none"
          className="stroke-fg-tertiary"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          opacity={0.7}
        />
      ) : null}
      <path
        d={path(values, total, min, max, width, height)}
        fill="none"
        className="stroke-info"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
