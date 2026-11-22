import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getUser } from "@/lib/supabase/server";

import { signIn } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function Page({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const target = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
  if (await getUser()) redirect(target ?? "/app");
  return <AuthForm mode="login" action={signIn} next={target} />;
}
