"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Kbd } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export type Command = {
  label: string;
  href: string;
  group: string;
  /** Second key of the "g then key" shortcut. */
  shortcut?: string;
  hint?: string;
};

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** Every word of the query must appear in the label or its group. */
function matches(command: Command, query: string) {
  const hay = `${command.label} ${command.group} ${command.hint ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

export function CommandPalette({ commands }: { commands: Command[] }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const pendingG = useRef<number | null>(null);

  const results = useMemo(() => commands.filter((c) => matches(c, query)), [commands, query]);

  const open = useCallback(() => {
    setQuery("");
    setIndex(0);
    dialog.current?.showModal();
    input.current?.focus();
  }, []);

  const go = useCallback(
    (command: Command | undefined) => {
      if (!command) return;
      dialog.current?.close();
      router.push(command.href);
    },
    [router],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (dialog.current?.open) dialog.current.close();
        else open();
        return;
      }
      if (dialog.current?.open || isTyping(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();
      if (pendingG.current !== null) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        const target = commands.find((c) => c.shortcut === key);
        if (target) {
          event.preventDefault();
          router.push(target.href);
        }
        return;
      }
      if (key === "g") {
        pendingG.current = window.setTimeout(() => {
          pendingG.current = null;
        }, 900);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commands, open, router]);

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="flex h-8 w-64 items-center gap-2 rounded-sm border max-lg:hidden border-line bg-raised px-2.5 text-[13px] text-fg-tertiary transition-colors duration-100 hover:border-line-strong hover:text-fg-secondary"
      >
        <Search aria-hidden="true" className="size-3.5" />
        <span className="flex-1 text-left">Go to…</span>
        <span className="flex items-center gap-0.5">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <dialog
        ref={dialog}
        aria-label="Command palette"
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
        className="m-0 mx-auto mt-[18vh] w-[min(640px,calc(100vw-2rem))] rounded-lg bg-overlay p-0 text-fg shadow-dialog backdrop:bg-inset/70"
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search aria-hidden="true" className="size-4 text-fg-tertiary" />
          <input
            ref={input}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setIndex((i) => Math.min(i + 1, results.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                go(results[index]);
              }
            }}
            placeholder="Type a page or action"
            aria-label="Search pages and actions"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={results[index] ? `palette-${index}` : undefined}
            className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-tertiary"
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul id="palette-results" role="listbox" className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-[13px] text-fg-tertiary">
              Nothing matches “{query}”.
            </li>
          ) : null}
          {results.map((command, i) => {
            const header = command.group !== results[i - 1]?.group ? command.group : null;
            return (
              <li key={command.href + command.label} role="presentation">
                {header ? <div className="label-caps px-2.5 pb-1 pt-2">{header}</div> : null}
                <button
                  type="button"
                  id={`palette-${i}`}
                  role="option"
                  aria-selected={i === index}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => go(command)}
                  className={cn(
                    "flex h-9 w-full items-center justify-between gap-3 rounded-sm px-2.5 text-left text-[13px]",
                    i === index ? "bg-active text-fg" : "text-fg-secondary",
                  )}
                >
                  <span className="truncate">{command.label}</span>
                  {command.shortcut ? (
                    <span className="flex shrink-0 items-center gap-1 text-fg-tertiary">
                      <Kbd>G</Kbd>
                      <Kbd>{command.shortcut.toUpperCase()}</Kbd>
                    </span>
                  ) : command.hint ? (
                    <span className="shrink-0 text-xs text-fg-tertiary">{command.hint}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </dialog>
    </>
  );
}
