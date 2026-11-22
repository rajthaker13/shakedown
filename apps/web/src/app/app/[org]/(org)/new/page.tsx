import type { Metadata } from "next";

import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/shell/shell";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { requireOrg } from "@/lib/data";

import { createProject } from "../../../actions";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage({ params }: PageProps<"/app/[org]/new">) {
  const { org: slug } = await params;
  const org = await requireOrg(slug);
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Projects", href: `/app/${org.slug}` }, { label: "New" }]}
        title="New project"
        description="Use one project per policy and task, for example “ACT pick and place, cell 3”."
      />
      <div className="max-w-2xl px-4 py-5 lg:px-6">
        <Card>
          <ActionForm action={createProject} submit="Create project" variant="primary" hidden={{ org: org.slug }}>
            <div className="flex flex-col gap-4 px-4 py-4">
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" required maxLength={80} autoFocus />
              </Field>
              <Field
                label="URL name"
                htmlFor="slug"
                hint={`Optional. Lowercase letters, digits and dashes. Appears as /app/${org.slug}/<url-name>.`}
              >
                <Input id="slug" name="slug" maxLength={40} pattern="[a-z0-9][a-z0-9-]*" spellCheck={false} className="font-mono" />
              </Field>
              <Field label="Description" htmlFor="description" hint="Optional.">
                <Textarea id="description" name="description" maxLength={500} />
              </Field>
              <Field label="Repository" htmlFor="repo_url" hint="Optional.">
                <Input id="repo_url" name="repo_url" type="url" placeholder="https://github.com/acme/policies" />
              </Field>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
