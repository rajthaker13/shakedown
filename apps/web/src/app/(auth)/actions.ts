"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { siteUrl } from "@/lib/brand";
import { allow, clientAddress } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string; email?: string } | null;

const credentials = z.object({
  email: z.email("Enter a valid email address.").max(200),
  password: z.string().min(8, "Use at least 8 characters.").max(200),
});

/** Only follow redirects to paths on this site. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/app";
}

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const parsed = credentials.safeParse({ email, password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const message =
      error.code === "email_not_confirmed"
        ? "Confirm your email address first. Check your inbox for the link."
        : "That email and password do not match an account.";
    return { error: message, email };
  }
  redirect(safeNext(form.get("next")));
}

export async function requestReset(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  if (!z.email().safeParse(email).success) return { error: "Enter a valid email address.", email };
  if (!(await allow(`reset:${await clientAddress()}`, 5, 3600))) {
    return { error: "Too many attempts. Try again in an hour.", email };
  }
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/confirm?next=/reset`,
  });
  // The same answer whether or not the address has an account.
  return {
    message: "If that address has an account, a link to set a new password is on its way.",
    email,
  };
}

export async function setPassword(_prev: AuthState, form: FormData): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "This link has expired. Ask for a new one." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      error:
        error.code === "same_password"
          ? "Choose a password you have not used here before."
          : "Could not set the password. Ask for a new link and try again.",
    };
  }
  redirect("/app");
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const parsed = credentials.safeParse({ email, password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: {
      data: { display_name: name },
      emailRedirectTo: `${siteUrl}/auth/confirm`,
    },
  });
  if (error) {
    const message =
      error.code === "user_already_exists"
        ? "An account with this email already exists. Sign in instead."
        : error.code === "weak_password"
          ? "Choose a stronger password."
          : "Could not create the account. Try again in a moment.";
    return { error: message, email };
  }
  if (!data.session) {
    return { message: "Check your inbox to confirm your email address, then sign in.", email };
  }
  redirect(safeNext(form.get("next")));
}
