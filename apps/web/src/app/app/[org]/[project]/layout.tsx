import type { Metadata } from "next";

import { Shell } from "@/components/shell/shell";
import { getProjectContext } from "@/lib/data";

export async function generateMetadata({
  params,
}: LayoutProps<"/app/[org]/[project]">): Promise<Metadata> {
  const { org, project } = await params;
  const ctx = await getProjectContext(org, project);
  return { title: { default: ctx.project.name, template: `%s · ${ctx.project.name}` } };
}

export default async function ProjectLayout({
  children,
  params,
}: LayoutProps<"/app/[org]/[project]">) {
  const { org, project } = await params;
  const ctx = await getProjectContext(org, project);
  return (
    <Shell
      org={{ slug: ctx.org.slug, name: ctx.org.name }}
      project={{
        slug: ctx.project.slug,
        name: ctx.project.name,
        isPublic: ctx.project.is_public,
      }}
      canWrite={ctx.canWrite}
    >
      {children}
    </Shell>
  );
}
