import Link from "next/link";

import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center px-6">
        <Link href="/" aria-label="Home">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-24 pt-[10vh]">
        <div className="w-full max-w-[360px]">{children}</div>
      </main>
    </div>
  );
}
