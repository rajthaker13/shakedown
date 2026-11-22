import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getUser } from "@/lib/supabase/server";

import { signUp } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create account" };

export default async function Page({ searchParams }: PageProps<"/signup">) {
  const { next } = await searchParams;
  const target = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
  if (await getUser()) redirect(target ?? "/app");
  return <AuthForm mode="signup" action={signUp} next={target} />;
}
