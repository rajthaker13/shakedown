import type { ReactNode } from "react";

import { DocsHeader } from "@/components/docs/header";
import { DocsMobileNav, DocsSidebar } from "@/components/docs/sidebar";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-base">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-30 focus:rounded-sm focus:border focus:border-line-strong focus:bg-overlay focus:px-3 focus:py-2 focus:text-[14px] focus:text-fg"
      >
        Skip to content
      </a>
      <DocsHeader />
      <DocsMobileNav />
      <div className="mx-auto flex w-full max-w-[1320px] flex-1">
        <DocsSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
