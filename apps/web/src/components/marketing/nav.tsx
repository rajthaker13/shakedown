import Link from "next/link";

import { Logo } from "@/components/logo";
import { LinkButton } from "@/components/ui/button";
import { brand } from "@/lib/brand";
import { getUser } from "@/lib/supabase/server";

const LINKS = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Demo", href: "/demo" },
  { label: "Docs", href: "/docs" },
  { label: "Pricing", href: "/#pricing" },
];

export async function MarketingNav() {
  const user = await getUser().catch(() => null);
  return (
    <header className="sticky top-0 z-40 border-b border-line-subtle bg-base/95 supports-[backdrop-filter]:bg-base/80 supports-[backdrop-filter]:backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-6 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" aria-label={`${brand.name} home`}>
            <Logo />
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 max-md:hidden">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-sm px-2.5 py-1.5 text-sm text-fg-secondary transition-colors duration-100 hover:text-fg"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <LinkButton href="/app" variant="primary">
              Open dashboard
            </LinkButton>
          ) : (
            <>
              <LinkButton href="/login" variant="ghost" className="max-sm:hidden">
                Sign in
              </LinkButton>
              <LinkButton href="/signup" variant="primary">
                Start testing
              </LinkButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  const groups = [
    {
      title: "Product",
      links: [
        { label: "Live demo", href: "/demo" },
        { label: "How it works", href: "/#how-it-works" },
        { label: "Pricing", href: "/#pricing" },
        { label: "Contact", href: "/contact" },
      ],
    },
    {
      title: "Docs",
      links: [
        { label: "Quickstart", href: "/docs/quickstart" },
        { label: "Scenario files", href: "/docs/scenarios" },
        { label: "Perturbations", href: "/docs/perturbations" },
        { label: "Running in CI", href: "/docs/ci" },
      ],
    },
    {
      title: "Read before you trust it",
      links: [
        { label: "How verdicts are decided", href: "/docs/statistics" },
        { label: "Sim-to-real validation", href: "/docs/sim-to-real" },
        { label: "Limitations", href: "/docs/limitations" },
      ],
    },
  ];
  return (
    <footer className="border-t border-line-subtle">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-[13px] text-fg-tertiary">{brand.tagline}.</p>
        </div>
        {groups.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h2 className="label-caps">{group.title}</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[13px] text-fg-secondary transition-colors duration-100 hover:text-fg"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </footer>
  );
}
