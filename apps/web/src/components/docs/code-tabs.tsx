"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export type CodeTab = { label: string; content: ReactNode };

/** Tabbed code samples. Pass each tab a `<CodeBlock bare />` rendered on the server. */
export function CodeTabs({ tabs }: { tabs: CodeTab[] }) {
  const [selected, setSelected] = useState(0);
  const baseId = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    let next = selected;
    if (event.key === "ArrowRight") next = (selected + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (selected - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    setSelected(next);
    buttons.current[next]?.focus();
  };

  return (
    <div className="my-6 overflow-hidden rounded-md border border-line bg-inset">
      <div
        role="tablist"
        aria-label="Code sample variants"
        className="flex h-10 items-stretch gap-1 border-b border-line px-2"
      >
        {tabs.map((tab, index) => {
          const active = index === selected;
          return (
            <button
              key={tab.label}
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${index}`}
              aria-selected={active}
              aria-controls={`${baseId}-panel-${index}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setSelected(index)}
              onKeyDown={move}
              className={cn(
                "relative px-2.5 text-[13px] font-medium transition-colors duration-100",
                active ? "text-fg" : "text-fg-tertiary hover:text-fg-secondary",
              )}
            >
              {tab.label}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-2.5 -bottom-px h-0.5",
                  active ? "bg-accent" : "bg-transparent",
                )}
              />
            </button>
          );
        })}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={tab.label}
          role="tabpanel"
          id={`${baseId}-panel-${index}`}
          aria-labelledby={`${baseId}-tab-${index}`}
          hidden={index !== selected}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
