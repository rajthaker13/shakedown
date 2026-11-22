"use server";

import { z } from "zod";

import { allow, clientAddress } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export type ContactState = { error?: string; sent?: boolean } | null;

const input = z.object({
  email: z.email("Enter a valid email address.").max(200),
  name: z.string().max(120),
  company: z.string().max(120),
  message: z.string().max(4000),
});

export async function sendMessage(_prev: ContactState, form: FormData): Promise<ContactState> {
  // A field people cannot see. Anything that fills it in is not a person.
  if (String(form.get("website") ?? "")) return { sent: true };

  const parsed = input.safeParse({
    email: String(form.get("email") ?? "").trim(),
    name: String(form.get("name") ?? "").trim(),
    company: String(form.get("company") ?? "").trim(),
    message: String(form.get("message") ?? "").trim(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!(await allow(`contact:${await clientAddress()}`, 5, 3600))) {
    return { error: "You have sent several messages already. Try again in an hour." };
  }

  const { error } = await createAdminClient()
    .from("leads")
    .insert({ ...parsed.data, source: String(form.get("source") ?? "contact").slice(0, 40) });
  if (error) return { error: "Could not send your message. Try again in a moment." };
  return { sent: true };
}
