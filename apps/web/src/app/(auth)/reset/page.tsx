import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Field, Input } from "@/components/ui/form";
import { getUser } from "@/lib/supabase/server";

import { setPassword } from "../actions";
import { SimpleAuthForm } from "../simple-form";

export const metadata: Metadata = { title: "Set a new password" };

export default async function ResetPage() {
  // The link in the email signs the person in before sending them here.
  if (!(await getUser())) redirect("/forgot");
  return (
    <SimpleAuthForm
      title="Set a new password"
      lead="Choose a password of at least 8 characters."
      action={setPassword}
      submit="Save and continue"
    >
      <Field label="New password" htmlFor="password">
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
      </Field>
    </SimpleAuthForm>
  );
}
