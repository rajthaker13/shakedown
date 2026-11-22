import Link from "next/link";

import { Logo } from "@/components/logo";
import { LinkButton } from "@/components/ui/button";
import { brand } from "@/lib/brand";

export function DocsHeader() {
  return (
    <header className="sticky top-0 z-20 h-16 border-b border-line bg-base">
      <div className="mx-auto flex h-full w-full max-w-[1320px] items-center gap-3 px-4 sm:gap-6 lg:px-6">
        <Link href="/" aria-label={`${brand.name} home`} className="rounded-xs">
          <Logo />
        </Link>
        <nav aria-label="Site" className="flex items-center gap-1 max-sm:hidden">
          <Link
            href="/docs"
            aria-current="true"
            className="rounded-sm bg-active px-2.5 py-1.5 text-[14px] font-medium leading-5 text-fg"
          >
            Docs
          </Link>
          <Link
            href="/demo"
            className="rounded-sm px-2.5 py-1.5 text-[14px] leading-5 text-fg-secondary transition-colors duration-100 hover:bg-raised hover:text-fg"
          >
            Demo
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LinkButton href="/login" variant="ghost" className="hidden sm:inline-flex">
            Sign in
          </LinkButton>
          <LinkButton href="/signup" variant="primary">
            Start testing
          </LinkButton>
        </div>
      </div>
    </header>
  );
}
