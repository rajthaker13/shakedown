import type { Verdict } from "@/components/ui/status";
import type { Outcomes } from "@/lib/stats";

export type MatrixColumn = {
  id: string;
  number: number;
  label: string;
  sha: string | null;
  branch: string | null;
  status: "running" | "completed" | "failed" | "cancelled";
  startedAt: string;
  /** Success rate over every episode in the run. */
  rate: number | null;
  href: string;
};

export type MatrixRow = {
  key: string;
  scenario: string;
  label: string;
  description: string;
  tags: string[];
  sweepName: string | null;
  sweepValue: string | null;
  perturbations: string[];
};

export type MatrixCell = {
  n: number;
  successes: number;
  rate: number;
  ciLow: number;
  ciHigh: number;
  verdict: Verdict;
  fingerprint: string;
  outcomes: Outcomes;
  /** The most important check message, as the CLI would print it. */
  headline: string;
  href: string;
};

export type MatrixData = {
  columns: MatrixColumn[];
  rows: MatrixRow[];
  /** cells[rowKey][columnId] */
  cells: Record<string, Record<string, MatrixCell | undefined>>;
  /** Deltas smaller than this many points are drawn as unchanged. */
  noiseThresholdPts: number;
  minEpisodes: number;
};

export type Mode = "status" | "heatmap" | "delta";
