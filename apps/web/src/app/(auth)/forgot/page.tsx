import type { Metadata } from "next";

import { Field, Input } from "@/components/ui/form";

import { requestReset } from "../actions";
import { SimpleAuthForm } from "../simple-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPage() {
  return (
    <SimpleAuthForm
      title="Reset your password"
      lead="Enter the address you signed up with and we will send a link."
      action={requestReset}
      submit="Send the link"
    >
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" required autoComplete="email" spellCheck={false} />
      </Field>
    </SimpleAuthForm>
  );
}
