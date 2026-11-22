import { Shell } from "@/components/shell/shell";
import { requireOrg } from "@/lib/data";

export default async function OrgLayout({ children, params }: LayoutProps<"/app/[org]">) {
  const { org: slug } = await params;
  const org = await requireOrg(slug);
  return <Shell org={{ slug: org.slug, name: org.name }}>{children}</Shell>;
}
