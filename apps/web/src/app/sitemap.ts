import type { MetadataRoute } from "next";

import { docsPages } from "@/components/docs/nav";
import { siteUrl } from "@/lib/brand";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["/", "/contact", ...docsPages.map((page) => page.href)];
  return paths.map((path) => ({ url: `${siteUrl}${path}` }));
}
