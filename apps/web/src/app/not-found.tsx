import Link from "next/link";

import { Logo } from "@/components/logo";
import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <Link href="/" aria-label="Home">
        <Logo />
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Page not found</h1>
        <p className="mt-2 text-[15px] text-fg-secondary">
          The page does not exist, or you do not have access to it.
        </p>
      </div>
      <div className="flex gap-2">
        <LinkButton href="/" variant="secondary">
          Home
        </LinkButton>
        <LinkButton href="/docs" variant="secondary">
          Documentation
        </LinkButton>
      </div>
    </main>
  );
}
