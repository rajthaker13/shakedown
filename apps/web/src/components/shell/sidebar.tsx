"use client";

import { BookOpen, ChevronsUpDown, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoMark } from "@/components/logo";
import { LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";

import { orgNav, projectNav, type NavItem } from "./nav";

export type ShellOrg = { slug: string; name: string };

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-8 items-center gap-2.5 rounded-sm px-2.5 text-[13px] transition-colors duration-100",
        active
          ? "bg-active font-medium text-fg"
          : "text-fg-secondary hover:bg-raised hover:text-fg",
      )}
    >
      {active ? (
        <span aria-hidden="true" className="absolute inset-y-1.5 -left-2 w-0.5 rounded-full bg-accent" />
      ) : null}
      <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function Sidebar({
  org,
  orgs,
  project,
  canWrite,
  user,
}: {
  org: ShellOrg;
  orgs: ShellOrg[];
  project?: { slug: string; name: string; isPublic: boolean };
  canWrite: boolean;
  user: { email: string } | null;
}) {
  const pathname = usePathname();
  const member = orgs.some((o) => o.slug === org.slug);
  // Built here rather than passed in: icons are components and cannot cross
  // from a Server Component into a Client Component.
  const projectItems = project ? projectNav(org.slug, project.slug, canWrite) : [];
  const orgItems = member ? orgNav(org.slug) : [];

  return (
    <aside className="flex h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface max-lg:hidden">
      <div className="flex h-12 items-center gap-2 border-b border-line-subtle px-3">
        <Link href="/" aria-label="Shakedown home" className="rounded-xs p-1">
          <LogoMark />
        </Link>
        {member && orgs.length > 1 ? (
          <details className="group relative min-w-0 flex-1">
            <summary className="flex h-8 cursor-pointer list-none items-center justify-between gap-2 rounded-sm px-2 text-[13px] font-medium hover:bg-raised [&::-webkit-details-marker]:hidden">
              <span className="truncate">{org.name}</span>
              <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0 text-fg-tertiary" />
            </summary>
            <ul className="absolute inset-x-0 top-9 z-20 rounded-md bg-overlay p-1 shadow-popover">
              {orgs.map((o) => (
                <li key={o.slug}>
                  <Link
                    href={`/app/${o.slug}`}
                    className={cn(
                      "flex h-8 items-center rounded-sm px-2 text-[13px] hover:bg-active",
                      o.slug === org.slug ? "text-fg" : "text-fg-secondary",
                    )}
                  >
                    <span className="truncate">{o.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <span className="truncate px-2 text-[13px] font-medium">{org.name}</span>
        )}
      </div>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
        {project ? (
          <div className="flex flex-col gap-1">
            <div className="mb-1 flex items-center justify-between px-2.5">
              <span className="label-caps truncate">{project.name}</span>
              {project.isPublic ? (
                <span className="rounded-xs border border-line px-1 text-[10px] uppercase tracking-[0.06em] text-fg-tertiary">
                  Public
                </span>
              ) : null}
            </div>
            {projectItems.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        ) : null}

        {member ? (
          <div className="flex flex-col gap-1">
            <span className="label-caps mb-1 px-2.5">Organization</span>
            {orgItems.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        ) : null}

        <div className="mt-auto flex flex-col gap-1">
          <Link
            href="/docs"
            className="flex h-8 items-center gap-2.5 rounded-sm px-2.5 text-[13px] text-fg-secondary transition-colors duration-100 hover:bg-raised hover:text-fg"
          >
            <BookOpen aria-hidden="true" className="size-4" strokeWidth={1.75} />
            Docs
          </Link>
        </div>
      </nav>

      <div className="border-t border-line-subtle p-3">
        {user ? (
          <form action="/auth/signout" method="post" className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate px-1 text-xs text-fg-secondary" title={user.email}>
              {user.email}
            </span>
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className="inline-flex size-7 items-center justify-center rounded-sm text-fg-tertiary transition-colors duration-100 hover:bg-raised hover:text-fg"
            >
              <LogOut aria-hidden="true" className="size-3.5" />
            </button>
          </form>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="px-1 text-xs text-fg-secondary">
              You are viewing a public project. Test your own policy:
            </p>
            <LinkButton href="/signup" variant="primary" size="sm">
              Create an account
            </LinkButton>
          </div>
        )}
      </div>
    </aside>
  );
}
