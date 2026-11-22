import { redirect } from "next/navigation";

import { getMyOrgs } from "@/lib/data";
import { getUser } from "@/lib/supabase/server";

export default async function AppIndex() {
  if (!(await getUser())) redirect("/login?next=/app");
  const orgs = await getMyOrgs();
  if (!orgs.length) redirect("/login?error=no-org");
  redirect(`/app/${orgs[0].slug}`);
}
