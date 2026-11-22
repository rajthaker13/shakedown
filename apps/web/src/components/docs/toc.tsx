"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";

export type TocItem = { id: string; title: string; level?: 2 | 3 };

/** Distance from the top of the viewport at which a heading becomes current. */
const LINE = 104;

export function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    // The observer fires whenever a heading crosses the line below the header.
    // The current heading is the last one above that line.
    const update = () => {
      let current = headings[0].id;
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= LINE) current = heading.id;
        else break;
      }
      setActive(current);
    };

    const observer = new IntersectionObserver(update, {
      rootMargin: `-${LINE}px 0px 0px 0px`,
      threshold: [0, 1],
    });
    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav aria-label="On this page">
      <p className="label-caps">On this page</p>
      <ul className="mt-3 border-l border-line-subtle">
        {items.map((item) => {
          const current = item.id === active;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={current ? "location" : undefined}
                className={cn(
                  "-ml-px block border-l py-1 text-[13px] leading-5 transition-colors duration-100",
                  item.level === 3 ? "pl-6" : "pl-3",
                  current
                    ? "border-accent text-fg"
                    : "border-transparent text-fg-tertiary hover:text-fg-secondary",
                )}
              >
                {item.title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
