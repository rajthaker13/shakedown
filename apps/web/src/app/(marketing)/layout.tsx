import { MarketingFooter, MarketingNav } from "@/components/marketing/nav";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-accent focus:px-3 focus:py-2 focus:text-on-accent"
      >
        Skip to content
      </a>
      <MarketingNav />
      <main id="content" className="flex-1">
        {children}
      </main>
      <MarketingFooter />
    </>
  );
}
