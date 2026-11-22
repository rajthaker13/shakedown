"use client";

import { useActionState } from "react";

import { sendMessage } from "@/app/(marketing)/contact/actions";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/form";

export function ContactForm({ source = "contact" }: { source?: string }) {
  const [state, submit, pending] = useActionState(sendMessage, null);

  if (state?.sent) {
    return (
      <FormMessage kind="success">
        Thanks. Your message has been received, and you will get a reply by email.
      </FormMessage>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-4">
      <input type="hidden" name="source" value={source} />
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label>
          Leave this empty
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="contact-name">
          <Input id="contact-name" name="name" autoComplete="name" maxLength={120} />
        </Field>
        <Field label="Company" htmlFor="contact-company">
          <Input id="contact-company" name="company" autoComplete="organization" maxLength={120} />
        </Field>
      </div>
      <Field label="Work email" htmlFor="contact-email">
        <Input id="contact-email" name="email" type="email" required autoComplete="email" spellCheck={false} />
      </Field>
      <Field
        label="What are you testing?"
        htmlFor="contact-message"
        hint="The policy, the robot, the task, and how you test a new checkpoint today."
      >
        <Textarea id="contact-message" name="message" maxLength={4000} />
      </Field>
      {state?.error ? <FormMessage kind="error">{state.error}</FormMessage> : null}
      <div>
        <Button type="submit" variant="primary" size="lg" disabled={pending}>
          {pending ? "Sending…" : "Send message"}
        </Button>
      </div>
    </form>
  );
}
