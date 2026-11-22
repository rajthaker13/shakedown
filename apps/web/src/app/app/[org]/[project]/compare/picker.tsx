"use client";

import { ArrowLeftRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

type Option = { number: number; label: string; suite: string };

export function ComparePicker({
  root,
  base,
  head,
  showAll,
  runs,
}: {
  root: string;
  base: number;
  head: number;
  showAll: boolean;
  runs: Option[];
}) {
  const router = useRouter();
  const go = (nextBase: number, nextHead: number) => {
    const params = new URLSearchParams({ base: String(nextBase), head: String(nextHead) });
    if (showAll) params.set("show", "all");
    router.push(`${root}/compare?${params}`);
  };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const el = event.target as HTMLElement | null;
      if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === "x") go(head, base);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const select =
    "h-8 max-w-52 rounded-sm border border-line-control bg-raised px-2 font-mono text-xs text-fg hover:border-fg-tertiary";
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1.5 text-[13px] text-fg-secondary">
        Base
        <select value={base} onChange={(e) => go(Number(e.target.value), head)} className={select}>
          {runs.map((r) => (
            <option key={r.number} value={r.number}>
              #{r.number} {r.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => go(head, base)}
        aria-label="Swap base and head"
        title="Swap (X)"
        className="inline-flex size-8 items-center justify-center rounded-sm text-fg-secondary transition-colors duration-100 hover:bg-raised hover:text-fg"
      >
        <ArrowLeftRight aria-hidden="true" className="size-4" />
      </button>
      <label className="flex items-center gap-1.5 text-[13px] text-fg-secondary">
        Head
        <select value={head} onChange={(e) => go(base, Number(e.target.value))} className={select}>
          {runs.map((r) => (
            <option key={r.number} value={r.number}>
              #{r.number} {r.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
