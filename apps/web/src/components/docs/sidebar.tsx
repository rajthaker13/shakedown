"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";

import { cn } from "@/lib/cn";

import { docsNav, docsPages } from "./nav";

function normalize(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="space-y-7">
      {docsNav.map((group) => (
        <div key={group.label}>
          <p className="label-caps px-3">{group.label}</p>
          <ul className="mt-2 space-y-px">
            {group.items.map((item) => {
              const active = item.href === pathname;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    className={cn(
                      "relative flex min-h-8 items-center rounded-sm px-3 py-1.5 text-[14px] leading-5 transition-colors duration-100",
                      active
                        ? "bg-active font-medium text-fg"
                        : "text-fg-secondary hover:bg-raised hover:text-fg",
                    )}
                  >
                    {active ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-1.5 left-0 w-0.5 rounded-xs bg-accent"
                      />
                    ) : null}
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Left navigation on desktop. */
export function DocsSidebar() {
  const pathname = normalize(usePathname());
  return (
    <aside className="hidden w-[260px] shrink-0 border-r border-line bg-surface lg:block">
      <nav
        aria-label="Documentation"
        className="sticky top-16 h-[calc(100dvh-4rem)] overflow-y-auto px-3 py-8"
      >
        <NavList pathname={pathname} />
      </nav>
    </aside>
  );
}

/** The same navigation as a disclosure under the header on small screens. */
export function DocsMobileNav() {
  const pathname = normalize(usePathname());
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const current = docsPages.find((item) => item.href === pathname);

  return (
    <div className="sticky top-16 z-10 border-b border-line bg-surface lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-full items-center justify-between gap-3 px-4 text-left text-[14px] text-fg"
      >
        <span className="min-w-0 truncate">
          <span className="text-fg-tertiary">Docs / </span>
          <span className="font-medium">{current ? current.title : "Menu"}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-fg-tertiary transition-transform duration-100",
            open && "rotate-180",
          )}
        />
      </button>
      <nav
        id={panelId}
        aria-label="Documentation"
        hidden={!open}
        className="max-h-[calc(100dvh-6.75rem)] overflow-y-auto border-t border-line-subtle px-1 py-5"
      >
        <NavList pathname={pathname} onNavigate={() => setOpen(false)} />
      </nav>
    </div>
  );
}
