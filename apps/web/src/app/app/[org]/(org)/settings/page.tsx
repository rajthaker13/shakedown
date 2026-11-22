import type { Metadata } from "next";

import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/shell/shell";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { listInvites, listMembers, requireOrg } from "@/lib/data";
import { relativeTime } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";

import { cancelInvite, inviteMember, removeMember, renameOrg } from "../../../actions";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ params }: PageProps<"/app/[org]/settings">) {
  const { org: slug } = await params;
  const org = await requireOrg(slug);
  const user = await getUser();
  const admin = org.role === "owner" || org.role === "admin";
  const [members, invites] = await Promise.all([
    listMembers(org.id),
    admin ? listInvites(org.id) : Promise.resolve([]),
  ]);
  const path = `/app/${org.slug}/settings`;
  const hidden = { org_id: org.id, path };

  return (
    <>
      <PageHeader title="Team" description={`Everyone in ${org.name} can see and change its projects.`} />
      <div className="flex max-w-3xl flex-col gap-6 px-4 py-5 lg:px-6">
        <Card className="overflow-hidden">
          <CardHeader title={`Members (${members.length})`} />
          <ul>
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between gap-4 border-b border-line-subtle px-4 py-2.5 last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-fg">
                    {m.display_name || m.email}
                    {m.user_id === user?.id ? <span className="ml-1.5 font-normal text-fg-tertiary">you</span> : null}
                  </p>
                  <p className="truncate text-xs text-fg-tertiary">
                    {m.email} · joined {relativeTime(m.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-xs border border-line px-1.5 text-[11px] uppercase tracking-[0.04em] text-fg-secondary">
                    {m.role}
                  </span>
                  {admin && m.role !== "owner" && m.user_id !== user?.id ? (
                    <ActionForm
                      action={removeMember}
                      submit="Remove"
                      variant="ghost"
                      footer={false}
                      hidden={{ ...hidden, user_id: m.user_id }}
                      confirm={`Remove ${m.email} from ${org.name}?`}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {admin ? (
          <Card className="overflow-hidden">
            <CardHeader
              title="Invite someone"
              description="They join this organization when they create an account with the invited address. No email is sent: share the sign-up link with them."
            />
            {invites.length ? (
              <ul className="border-b border-line-subtle">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-4 border-b border-line-subtle px-4 py-2 last:border-0">
                    <span className="truncate text-[13px] text-fg-secondary">
                      {i.email} · {i.role} · invited {relativeTime(i.created_at)}
                    </span>
                    <ActionForm action={cancelInvite} submit="Cancel" variant="ghost" footer={false} hidden={{ ...hidden, invite_id: i.id }} />
                  </li>
                ))}
              </ul>
            ) : null}
            <ActionForm action={inviteMember} submit="Invite" variant="primary" hidden={hidden}>
              <div className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_160px]">
                <Field label="Email" htmlFor="email">
                  <Input id="email" name="email" type="email" required spellCheck={false} />
                </Field>
                <Field label="Role" htmlFor="role">
                  <Select id="role" name="role" defaultValue="member">
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </Select>
                </Field>
              </div>
            </ActionForm>
          </Card>
        ) : null}

        {admin ? (
          <Card>
            <CardHeader title="Organization name" />
            <ActionForm action={renameOrg} submit="Save" hidden={hidden}>
              <div className="px-4 py-4">
                <Field label="Name" htmlFor="org-name">
                  <Input id="org-name" name="name" defaultValue={org.name} required maxLength={80} className="max-w-sm" />
                </Field>
              </div>
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
