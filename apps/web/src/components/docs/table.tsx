import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Reference table. The first column is set in monospace by default because it
 * usually holds a parameter, field or flag name.
 */
export function DocTable({
  caption,
  head,
  rows,
  monoFirst = true,
  numeric = [],
}: {
  /** Read by screen readers; not shown. */
  caption: string;
  head: string[];
  rows: ReactNode[][];
  monoFirst?: boolean;
  /** Indexes of right-aligned, tabular-figure columns. */
  numeric?: number[];
}) {
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label={caption}
      className="my-6 overflow-x-auto rounded-md border border-line"
    >
      <table className="w-full border-collapse text-left text-[14px] leading-[22px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line bg-surface">
            {head.map((cell, index) => (
              <th
                key={cell}
                scope="col"
                className={cn(
                  "label-caps whitespace-nowrap px-3 py-2.5",
                  numeric.includes(index) && "text-right",
                )}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-b border-line-subtle last:border-b-0">
              {row.map((cell, index) => {
                const className = cn(
                  "px-3 py-2.5 align-top",
                  index === 0 && monoFirst
                    ? "whitespace-nowrap font-mono text-[13px] font-normal text-fg"
                    : "text-fg-secondary",
                  numeric.includes(index) && "tabular text-right font-mono text-[13px]",
                );
                return index === 0 ? (
                  <th key={index} scope="row" className={className}>
                    {cell}
                  </th>
                ) : (
                  <td key={index} className={className}>
                    {cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
