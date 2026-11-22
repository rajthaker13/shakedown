import { redirect } from "next/navigation";

import { DEMO_PATH } from "@/lib/demo";

/** Short link to the public demo project. */
export default function Demo() {
  redirect(DEMO_PATH);
}
