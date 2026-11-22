import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { getGroupLabel, getPage, getPrevNext, type NavItem } from "./nav";
import { Toc, type TocItem } from "./toc";

function PagerLink({ item, direction }: { item: NavItem; direction: "prev" | "next" }) {
  const next = direction === "next";
  return (
    <Link
      href={item.href}
      rel={direction}
      className={`group flex min-w-0 flex-1 flex-col gap-1 rounded-md border border-line bg-surface px-4 py-3 transition-colors duration-100 hover:border-line-strong hover:bg-raised ${
        next ? "items-end text-right" : "items-start"
      }`}
    >
      <span className="label-caps flex items-center gap-1.5">
        {next ? null : <ArrowLeft aria-hidden="true" className="size-3" />}
        {next ? "Next" : "Previous"}
        {next ? <ArrowRight aria-hidden="true" className="size-3" /> : null}
      </span>
      <span className="text-[15px] font-medium leading-6 text-fg">{item.title}</span>
    </Link>
  );
}

/**
 * Frame for one documentation page: title block, content column, prev/next
 * links and the "On this page" column. `toc` must list the ids of the page's
 * H2 and H3 headings in document order.
 */
export function DocPage({
  href,
  lead,
  toc,
  children,
}: {
  href: string;
  lead: ReactNode;
  toc: TocItem[];
  children: ReactNode;
}) {
  const page = getPage(href);
  const { prev, next } = getPrevNext(href);

  return (
    <div className="flex justify-center gap-12 px-4 pb-24 pt-10 sm:px-8 lg:pt-12 xl:gap-16">
      <main id="content" className="w-full min-w-0 max-w-[720px]">
        <article>
          <header>
            <p className="eyebrow text-fg-tertiary">{getGroupLabel(href)}</p>
            <h1 className="mt-3 text-[32px] font-semibold leading-10 tracking-[-0.02em] text-fg">
              {page.title}
            </h1>
            <p className="mt-4 text-[18px] leading-7 text-fg-secondary">{lead}</p>
          </header>
          {children}
        </article>
        <nav
          aria-label="Previous and next page"
          className="mt-16 flex flex-col gap-3 border-t border-line-subtle pt-8 sm:flex-row"
        >
          {prev ? <PagerLink item={prev} direction="prev" /> : <span className="flex-1" />}
          {next ? <PagerLink item={next} direction="next" /> : <span className="flex-1" />}
        </nav>
      </main>
      <aside className="hidden w-[200px] shrink-0 xl:block">
        <div className="sticky top-24 max-h-[calc(100dvh-8rem)] overflow-y-auto">
          <Toc items={toc} />
        </div>
      </aside>
    </div>
  );
}
