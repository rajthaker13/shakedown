import Link from "next/link";
import type { ReactNode } from "react";

import { LogoMark } from "@/components/logo";
import { getMyOrgs } from "@/lib/data";
import { getUser } from "@/lib/supabase/server";

import { CommandPalette, type Command } from "./command-palette";
import { orgNav, projectNav } from "./nav";
import { Sidebar } from "./sidebar";

export type Crumb = { label: string; href?: string };

/** Icons cannot cross the server/client boundary, so only plain data is passed on. */
function toCommands(items: { label: string; href: string; shortcut?: string }[], group: string) {
  return items.map<Command>((i) => ({ label: i.label, href: i.href, shortcut: i.shortcut, group }));
}

export async function Shell({
  org,
  project,
  canWrite = false,
  children,
}: {
  org: { slug: string; name: string };
  project?: { slug: string; name: string; isPublic: boolean };
  canWrite?: boolean;
  children: ReactNode;
}) {
  const [user, orgs] = await Promise.all([getUser(), getMyOrgs()]);
  const member = orgs.some((o) => o.slug === org.slug);
  const projectItems = project ? projectNav(org.slug, project.slug, canWrite) : [];
  const orgItems = member ? orgNav(org.slug) : [];

  const commands: Command[] = [
    ...(project ? toCommands(projectItems, project.name) : []),
    ...toCommands(orgItems, "Organization"),
    { label: "Documentation", href: "/docs", group: "Help" },
    { label: "Quickstart", href: "/docs/quickstart", group: "Help" },
    { label: "Scenario file reference", href: "/docs/scenarios", group: "Help" },
    ...(user ? [] : [{ label: "Create an account", href: "/signup", group: "Account" }]),
  ];

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        org={org}
        orgs={orgs.map((o) => ({ slug: o.slug, name: o.name }))}
        project={project}
        canWrite={canWrite}
        user={user?.email ? { email: user.email } : null}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-line bg-base px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" aria-label="Shakedown home" className="lg:hidden">
              <LogoMark />
            </Link>
            <MobileNav
              items={[...projectItems, ...orgItems].map((i) => ({ label: i.label, href: i.href }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <CommandPalette commands={commands} />
            {/* The sidebar holds these on wide screens. */}
            {user ? (
              <form action="/auth/signout" method="post" className="lg:hidden">
                <button
                  type="submit"
                  className="h-8 rounded-sm px-2 text-[13px] text-fg-secondary hover:bg-raised hover:text-fg"
                >
                  Sign out
                </button>
              </form>
            ) : (
              <Link
                href="/signup"
                className="flex h-8 items-center rounded-sm bg-accent px-2.5 text-[13px] font-medium text-on-accent lg:hidden"
              >
                Sign up
              </Link>
            )}
          </div>
        </header>
        <main id="main" className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Below the sidebar breakpoint, navigation moves into a horizontal strip. */
function MobileNav({ items }: { items: { label: string; href: string }[] }) {
  if (!items.length) return null;
  return (
    <nav aria-label="Sections" className="flex gap-1 overflow-x-auto lg:hidden">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="whitespace-nowrap rounded-sm px-2 py-1 text-[13px] text-fg-secondary hover:bg-raised hover:text-fg"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function PageHeader({
  crumbs,
  title,
  description,
  actions,
  meta,
}: {
  crumbs?: Crumb[];
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="border-b border-line-subtle px-4 pb-5 pt-5 lg:px-6">
      {crumbs?.length ? (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-fg-tertiary">
            {crumbs.map((crumb, i) => (
              <li key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
                {i > 0 ? <span aria-hidden="true">/</span> : null}
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-fg-secondary">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-fg-secondary">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-7 tracking-[-0.01em]">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-[13px] text-fg-secondary">{description}</p>
          ) : null}
          {meta ? <div className="mt-2">{meta}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
