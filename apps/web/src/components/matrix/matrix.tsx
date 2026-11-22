"use client";

import { ArrowDownRight, ArrowUpRight, Minus, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { LinkButton } from "@/components/ui/button";
import { Kbd } from "@/components/ui/card";
import { StatusBadge, StatusIcon, statusMeta } from "@/components/ui/status";
import { cn } from "@/lib/cn";
import { pct, points, pValue, shortSha } from "@/lib/format";
import { classify, compare, type Comparison, type DeltaClass } from "@/lib/stats";

import { diverge, divergeLegend, heat, heatLegend } from "./scales";
import type { MatrixCell, MatrixColumn, MatrixData, MatrixRow, Mode } from "./types";

const MODES: { id: Mode; label: string; key: string }[] = [
  { id: "status", label: "Status", key: "s" },
  { id: "heatmap", label: "Heatmap", key: "h" },
  { id: "delta", label: "Change", key: "d" },
];

const deltaMeta: Record<DeltaClass, { label: string; text: string }> = {
  regression: { label: "Regression", text: "text-fail" },
  suspect: { label: "Possible regression", text: "text-warn" },
  unchanged: { label: "No clear change", text: "text-fg-secondary" },
  improvement: { label: "Improvement", text: "text-info" },
};

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(
    el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)),
  );
}

export function Matrix({
  data,
  /** When false, state is kept out of the URL. Used where the matrix is embedded. */
  syncUrl = true,
  initial,
  onState,
  className,
}: {
  data: MatrixData;
  syncUrl?: boolean;
  initial?: { mode?: Mode; base?: string; cell?: string; only?: boolean };
  onState?: (next: { mode: Mode; base: string; cell: string | null; only: boolean }) => void;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const grid = useRef<HTMLDivElement>(null);

  const read = (name: string) => (syncUrl ? search.get(name) : null);
  const modeParam = read("mode") ?? initial?.mode ?? "status";
  const mode: Mode = MODES.some((m) => m.id === modeParam) ? (modeParam as Mode) : "status";
  const baseParam = read("base") ?? initial?.base;
  const base =
    data.columns.find((c) => c.label === baseParam)?.id ?? data.columns[0]?.id ?? "";
  const onlyChanged = (read("only") ?? (initial?.only ? "changed" : "")) === "changed";
  const selected = read("cell") ?? initial?.cell ?? null;

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      if (!syncUrl) {
        onState?.({
          mode: (patch.mode as Mode | undefined) ?? mode,
          base: patch.base ?? data.columns.find((c) => c.id === base)?.label ?? "",
          cell: "cell" in patch ? patch.cell : selected,
          only: "only" in patch ? patch.only === "changed" : onlyChanged,
        });
        return;
      }
      const params = new URLSearchParams(search.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [syncUrl, search, router, pathname, onState, mode, base, selected, onlyChanged, data.columns],
  );

  /** comparisons[rowKey][columnId], each column against the chosen baseline. */
  const comparisons = useMemo(() => {
    const out: Record<string, Record<string, Comparison | undefined>> = {};
    for (const row of data.rows) {
      const baseCell = data.cells[row.key]?.[base];
      out[row.key] = {};
      for (const column of data.columns) {
        const cell = data.cells[row.key]?.[column.id];
        if (!cell || !baseCell || column.id === base) continue;
        out[row.key][column.id] = compare(
          baseCell.outcomes,
          cell.outcomes,
          baseCell.fingerprint === cell.fingerprint,
        );
      }
    }
    return out;
  }, [data, base]);

  const maxDrop = data.noiseThresholdPts / 100;

  const rows = useMemo(() => {
    if (!onlyChanged) return data.rows;
    return data.rows.filter((row) =>
      data.columns.some((column) => {
        const cell = data.cells[row.key]?.[column.id];
        if (!cell) return false;
        if (cell.verdict === "FAIL" || cell.verdict === "WARN" || cell.verdict === "ERROR") {
          return true;
        }
        const cmp = comparisons[row.key]?.[column.id];
        return cmp ? classify(cmp, maxDrop) !== "unchanged" : false;
      }),
    );
  }, [data, comparisons, onlyChanged, maxDrop]);

  // Keyboard shortcuts for the view, and arrow keys within the grid.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (document.querySelector("dialog[open]")) return;
      const key = event.key.toLowerCase();
      const next = MODES.find((m) => m.key === key);
      if (next) update({ mode: next.id === "status" ? null : next.id });
      else if (key === "r") update({ only: onlyChanged ? null : "changed" });
      else if (key === "escape" && selected) update({ cell: null });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [update, onlyChanged, selected]);

  function onGridKey(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const r = Number(target.dataset.row);
    const c = Number(target.dataset.col);
    if (Number.isNaN(r) || Number.isNaN(c)) return;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const next = grid.current?.querySelector<HTMLElement>(
      `[data-row="${r + move[0]}"][data-col="${c + move[1]}"]`,
    );
    next?.focus();
  }

  if (!data.columns.length) return null;

  const selectedParts = selected?.split("::");
  const selectedRow = data.rows.find((r) => r.key === selectedParts?.[0]);
  const selectedColumn = data.columns.find((c) => c.label === selectedParts?.[1]);
  const selectedCell =
    selectedRow && selectedColumn ? data.cells[selectedRow.key]?.[selectedColumn.id] : undefined;
  const baseColumn = data.columns.find((c) => c.id === base);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-subtle px-4 py-2.5 lg:px-6">
        <div
          role="radiogroup"
          aria-label="Matrix view"
          className="flex h-8 items-center rounded-sm border border-line bg-surface p-0.5"
        >
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => update({ mode: m.id === "status" ? null : m.id })}
              className={cn(
                "flex h-full items-center gap-1.5 rounded-xs px-2.5 text-[13px] transition-colors duration-100",
                mode === m.id
                  ? "bg-active font-medium text-fg"
                  : "text-fg-secondary hover:text-fg",
              )}
            >
              {m.label}
              <Kbd>{m.key.toUpperCase()}</Kbd>
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-[13px] text-fg-secondary">
          Baseline
          <select
            value={baseColumn?.label ?? ""}
            onChange={(event) => update({ base: event.target.value })}
            className="h-8 rounded-sm border border-line-control bg-raised px-2 font-mono text-xs text-fg hover:border-fg-tertiary"
          >
            {data.columns.map((c) => (
              <option key={c.id} value={c.label}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-fg-secondary">
          <input
            type="checkbox"
            checked={onlyChanged}
            onChange={(event) => update({ only: event.target.checked ? "changed" : null })}
            className="size-3.5 accent-[var(--color-accent)]"
          />
          Problems only
          <Kbd>R</Kbd>
        </label>

        <div className="ml-auto">
          <Legend mode={mode} noise={data.noiseThresholdPts} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Grid */}
        <div className="min-w-0 flex-1 overflow-auto">
          <div
            ref={grid}
            role="grid"
            aria-label="Success rate by policy version and condition"
            aria-rowcount={rows.length + 1}
            aria-colcount={data.columns.length + 1}
            onKeyDown={onGridKey}
            className="grid w-max min-w-full [--row-min:132px] md:[--row-min:240px]"
            style={{
              gridTemplateColumns: `minmax(var(--row-min), 300px) repeat(${data.columns.length}, minmax(104px, 1fr))`,
            }}
          >
            <div role="row" className="contents">
              <div
                role="columnheader"
                className="sticky left-0 top-0 z-30 flex items-end border-b border-r border-line bg-surface px-4 py-2 lg:px-6"
              >
                <span className="label-caps">Condition</span>
              </div>
              {data.columns.map((column) => (
                <ColumnHeader key={column.id} column={column} isBase={column.id === base} />
              ))}
            </div>

            {rows.length === 0 ? (
              <div
                role="row"
                className="col-span-full px-6 py-10 text-center text-[13px] text-fg-secondary"
              >
                No condition failed, warned or changed against{" "}
                <span className="font-mono text-fg">{baseColumn?.label}</span>.
              </div>
            ) : null}

            {rows.map((row, r) => {
              const first = row.scenario !== rows[r - 1]?.scenario;
              return (
                <div role="row" aria-rowindex={r + 2} key={row.key} className="group contents">
                  <RowHeader row={row} first={first} />
                  {data.columns.map((column, c) => {
                    const cell = data.cells[row.key]?.[column.id];
                    const id = `${row.key}::${column.label}`;
                    return (
                      <Cell
                        key={column.id}
                        cell={cell}
                        column={column}
                        row={row}
                        r={r}
                        c={c}
                        mode={mode}
                        isBase={column.id === base}
                        comparison={comparisons[row.key]?.[column.id]}
                        maxDrop={maxDrop}
                        noise={data.noiseThresholdPts}
                        minEpisodes={data.minEpisodes}
                        selected={selected === id}
                        onSelect={() => update({ cell: selected === id ? null : id })}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail panel */}
        {selectedRow && selectedColumn && selectedCell ? (
          <Detail
            row={selectedRow}
            column={selectedColumn}
            cell={selectedCell}
            base={baseColumn}
            comparison={comparisons[selectedRow.key]?.[selectedColumn.id]}
            maxDrop={maxDrop}
            onClose={() => update({ cell: null })}
          />
        ) : null}
      </div>
    </div>
  );
}

function ColumnHeader({ column, isBase }: { column: MatrixColumn; isBase: boolean }) {
  return (
    <div
      role="columnheader"
      className="sticky top-0 z-20 flex flex-col gap-0.5 border-b border-r border-line bg-surface px-3 py-2"
    >
      <div className="flex items-center gap-1.5">
        <Link
          href={column.href}
          className="truncate font-mono text-xs font-medium text-fg underline-offset-4 hover:underline"
          title={`Run #${column.number}`}
        >
          {column.label}
        </Link>
        {isBase ? (
          <span className="rounded-xs border border-line-strong px-1 text-[10px] font-medium uppercase tracking-[0.06em] text-fg-secondary">
            Base
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-fg-tertiary">
        {column.status === "running" ? (
          <span className="inline-flex items-center gap-1 text-running">
            <StatusIcon status="RUNNING" className="size-3" />
            Running
          </span>
        ) : (
          <span className="tabular">{pct(column.rate)} overall</span>
        )}
        {column.sha ? <span className="font-mono">{shortSha(column.sha)}</span> : null}
      </div>
    </div>
  );
}

function RowHeader({ row, first }: { row: MatrixRow; first: boolean }) {
  const swept = row.sweepName !== null;
  return (
    <div
      role="rowheader"
      title={row.description || undefined}
      className={cn(
        "sticky left-0 z-10 flex min-h-11 flex-col justify-center border-b border-r border-line bg-base px-4 py-1.5 transition-colors duration-100 group-hover:bg-raised lg:px-6",
        first ? "border-t-line" : "",
      )}
    >
      {swept ? (
        <>
          {first ? (
            <span className="truncate text-[13px] font-medium text-fg">{row.scenario}</span>
          ) : null}
          <span className={cn("truncate font-mono text-xs text-fg-secondary", first ? "" : "pl-3")}>
            {first ? "" : "└ "}
            {row.sweepName} = {row.sweepValue}
          </span>
        </>
      ) : (
        <>
          <span className="truncate text-[13px] font-medium text-fg">{row.scenario}</span>
          {row.perturbations.length === 0 ? (
            <span className="text-xs text-fg-tertiary">no perturbation</span>
          ) : null}
        </>
      )}
    </div>
  );
}

function DeltaGlyph({ delta, className }: { delta: number; className?: string }) {
  const Icon = Math.round(delta * 100) === 0 ? Minus : delta < 0 ? ArrowDownRight : ArrowUpRight;
  return <Icon aria-hidden="true" className={cn("size-3 shrink-0", className)} />;
}

function Cell({
  cell,
  column,
  row,
  r,
  c,
  mode,
  isBase,
  comparison,
  maxDrop,
  noise,
  minEpisodes,
  selected,
  onSelect,
}: {
  cell: MatrixCell | undefined;
  column: MatrixColumn;
  row: MatrixRow;
  r: number;
  c: number;
  mode: Mode;
  isBase: boolean;
  comparison: Comparison | undefined;
  maxDrop: number;
  noise: number;
  minEpisodes: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const frame = "relative flex min-h-11 border-b border-r border-line-subtle";
  if (!cell) {
    return (
      <div role="gridcell" className={cn(frame, "items-center justify-center bg-base")}>
        {column.status === "running" ? (
          <span className="text-[11px] text-fg-tertiary">queued</span>
        ) : (
          <span aria-label="Not run" className="text-fg-disabled">
            –
          </span>
        )}
      </div>
    );
  }

  const kind = comparison ? classify(comparison, maxDrop) : null;
  const thin = cell.n < minEpisodes;
  let style: React.CSSProperties | undefined;
  let tone = "bg-base text-fg-secondary group-hover:bg-raised";
  let glyph: React.ReactNode = null;
  let main = pct(cell.rate);

  if (mode === "heatmap") {
    const h = heat(cell.rate);
    style = { backgroundColor: h.fill, color: h.text };
    tone = "";
    if (cell.verdict !== "PASS" && cell.verdict !== "SKIP") {
      const Icon = statusMeta[cell.verdict].icon;
      glyph = <Icon aria-hidden="true" className="size-3" />;
    }
  } else if (mode === "delta") {
    if (isBase || !comparison) {
      tone = "bg-surface text-fg-secondary";
    } else {
      const supported = kind === "regression" || kind === "improvement";
      const d = diverge(comparison.delta, noise, supported);
      style = { backgroundColor: d.fill, color: d.text };
      tone = "";
      main = points(comparison.delta);
      glyph = <DeltaGlyph delta={comparison.delta} />;
    }
  } else {
    const v = cell.verdict;
    if (v === "FAIL" || v === "ERROR") tone = "bg-fail-subtle text-fail";
    else if (v === "WARN") tone = "bg-warn-subtle text-warn";
    if (v !== "PASS" && v !== "SKIP") glyph = <StatusIcon status={v} className="size-3" />;
  }

  const what =
    mode === "delta" && comparison && !isBase
      ? `${points(comparison.delta)} points against the baseline, ${kind ? deltaMeta[kind].label.toLowerCase() : ""}`
      : `${pct(cell.rate)} success, ${cell.successes} of ${cell.n} episodes, ${statusMeta[cell.verdict].label.toLowerCase()}`;

  return (
    <div role="gridcell" aria-colindex={c + 2} className={cn(frame, "p-0")}>
      <button
        type="button"
        data-row={r}
        data-col={c}
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${row.label}, ${column.label}: ${what}`}
        style={style}
        className={cn(
          "flex w-full flex-col items-end justify-center gap-0.5 px-3 py-1.5 text-right transition-colors duration-100",
          tone,
          selected && "outline-2 -outline-offset-2 outline-accent",
        )}
      >
        <span className="flex items-center gap-1.5 font-mono text-[13px] font-medium tabular">
          {glyph}
          {main}
        </span>
        <span className="font-mono text-[11px] tabular opacity-75">
          {mode === "delta" && comparison && !isBase
            ? `${pct(comparison.baseRate)} → ${pct(comparison.headRate)}`
            : `${cell.successes}/${cell.n}`}
          {thin ? <span title={`Fewer than ${minEpisodes} episodes`}> · low n</span> : null}
        </span>
      </button>
    </div>
  );
}

function Legend({ mode, noise }: { mode: Mode; noise: number }) {
  if (mode === "heatmap") {
    return (
      <div className="flex items-center gap-2 text-[11px] text-fg-tertiary">
        <span>0%</span>
        <span className="flex overflow-hidden rounded-xs">
          {heatLegend.map((s) => (
            <span key={s.fill} className="h-3 w-4" style={{ backgroundColor: s.fill }} />
          ))}
        </span>
        <span>100% success</span>
      </div>
    );
  }
  if (mode === "delta") {
    return (
      <div className="flex items-center gap-2 text-[11px] text-fg-tertiary">
        <span>worse</span>
        <span className="flex overflow-hidden rounded-xs">
          {divergeLegend.map((s) => (
            <span key={s.fill} className="h-3 w-4" style={{ backgroundColor: s.fill }} />
          ))}
        </span>
        <span>better · strong color is statistically clear · gray is under {noise} points</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 text-[11px] text-fg-secondary">
      {(["PASS", "WARN", "FAIL"] as const).map((v) => (
        <span key={v} className="inline-flex items-center gap-1">
          <StatusIcon status={v} className="size-3" />
          {statusMeta[v].label}
        </span>
      ))}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="label-caps">{label}</dt>
      <dd className="font-mono text-[13px] tabular text-fg">{children}</dd>
    </div>
  );
}

function Seeds({ title, seeds, href }: { title: string; seeds: number[]; href: string }) {
  if (!seeds.length) return null;
  return (
    <div>
      <h4 className="label-caps mb-1.5">
        {title} ({seeds.length})
      </h4>
      <ul className="flex flex-wrap gap-1">
        {seeds.slice(0, 40).map((seed) => (
          <li key={seed}>
            <Link
              href={`${href}/${seed}`}
              className="inline-flex h-6 items-center rounded-xs border border-line bg-raised px-1.5 font-mono text-[11px] text-fg-secondary transition-colors duration-100 hover:border-line-strong hover:text-fg"
            >
              {seed}
            </Link>
          </li>
        ))}
        {seeds.length > 40 ? (
          <li className="self-center text-[11px] text-fg-tertiary">and {seeds.length - 40} more</li>
        ) : null}
      </ul>
    </div>
  );
}

function Detail({
  row,
  column,
  cell,
  base,
  comparison,
  maxDrop,
  onClose,
}: {
  row: MatrixRow;
  column: MatrixColumn;
  cell: MatrixCell;
  base: MatrixColumn | undefined;
  comparison: Comparison | undefined;
  maxDrop: number;
  onClose: () => void;
}) {
  const kind = comparison ? classify(comparison, maxDrop) : null;
  return (
    <aside
      aria-label="Cell detail"
      className="flex w-[min(440px,100vw)] shrink-0 flex-col overflow-y-auto border-l border-line bg-surface max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-40 max-md:shadow-dialog"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line-subtle px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusBadge status={cell.verdict} />
            <span className="truncate font-mono text-xs text-fg-secondary">{column.label}</span>
          </div>
          <h3 className="mt-1.5 text-sm font-semibold text-fg">{row.label}</h3>
          {row.description ? (
            <p className="mt-1 text-[13px] text-fg-secondary">{row.description}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-fg-tertiary transition-colors duration-100 hover:bg-raised hover:text-fg"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-5 px-4 py-4">
        <dl className="grid grid-cols-3 gap-4">
          <Stat label="Success">{pct(cell.rate)}</Stat>
          <Stat label="Episodes">
            {cell.successes}/{cell.n}
          </Stat>
          <Stat label="95% interval">
            {pct(cell.ciLow)}–{pct(cell.ciHigh)}
          </Stat>
        </dl>

        {row.perturbations.length ? (
          <div>
            <h4 className="label-caps mb-1.5">Perturbations</h4>
            <ul className="flex flex-col gap-1">
              {row.perturbations.map((p) => (
                <li key={p} className="break-all font-mono text-xs text-fg-secondary">
                  {p}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="rounded-sm border border-line bg-raised px-3 py-2 text-[13px] text-fg-secondary">
          {cell.headline}
        </p>

        {comparison && kind && base ? (
          <div className="flex flex-col gap-4 border-t border-line-subtle pt-4">
            <div>
              <h4 className="label-caps mb-1">
                Against <span className="font-mono normal-case tracking-normal">{base.label}</span>
              </h4>
              <p className={cn("flex items-center gap-1.5 text-sm font-medium", deltaMeta[kind].text)}>
                <DeltaGlyph delta={comparison.delta} className="size-4" />
                {deltaMeta[kind].label}: {points(comparison.delta)} points
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-4">
              <Stat label="Baseline">{pct(comparison.baseRate)}</Stat>
              <Stat label="This run">{pct(comparison.headRate)}</Stat>
              <Stat label="p value">{pValue(comparison.pValue)}</Stat>
            </dl>
            <p className="text-xs text-fg-tertiary">
              {comparison.paired
                ? "Paired on identical seeds with an exact McNemar test. Only the seeds whose outcome changed carry evidence."
                : "The two runs did not share seeds and conditions, so this is an unpaired Fisher exact test, which is less sensitive."}
            </p>
            <Seeds title="Seeds that broke" seeds={comparison.regressed} href={cell.href} />
            <Seeds title="Seeds that were fixed" seeds={comparison.improved} href={cell.href} />
          </div>
        ) : null}

        <LinkButton href={cell.href} variant="secondary">
          Open episodes and replays
        </LinkButton>
      </div>
    </aside>
  );
}
