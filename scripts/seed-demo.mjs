// Creates the public demo organization and project, and an API key for it.
//
//   node scripts/seed-demo.mjs
//
// Reads Supabase credentials from apps/web/.env.local. The key is written to
// .demo-key (ignored by git) so that runs can be uploaded with the CLI.
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");
const ws = require("ws");

const env = Object.fromEntries(
  readFileSync(join(root, "apps/web/.env.local"), "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

function check(result, what) {
  if (result.error) {
    console.error(`${what}: ${result.error.message}`);
    process.exit(1);
  }
  return result.data;
}

const org = check(
  await supabase
    .from("orgs")
    .upsert({ name: "Shakedown", slug: "shakedown" }, { onConflict: "slug" })
    .select("id")
    .single(),
  "create organization",
);

const project = check(
  await supabase
    .from("projects")
    .upsert(
      {
        org_id: org.id,
        name: "ALOHA transfer cube",
        slug: "aloha-transfer-cube",
        description:
          "A public ACT checkpoint (lerobot/act_aloha_sim_transfer_cube_human) in MuJoCo, run with four inference configurations across 19 conditions. Real results, 50 seeded episodes per cell.",
        is_public: true,
      },
      { onConflict: "org_id,slug" },
    )
    .select("id")
    .single(),
  "create project",
);

const key = `shk_${randomBytes(24).toString("hex")}`;
check(
  await supabase.from("api_keys").insert({
    project_id: project.id,
    name: "Demo seeding",
    prefix: key.slice(0, 10),
    hash: createHash("sha256").update(key).digest("hex"),
  }),
  "create API key",
);

writeFileSync(join(root, ".demo-key"), `${key}\n`, { mode: 0o600 });
console.log(`project ${project.id}`);
console.log("API key written to .demo-key");
