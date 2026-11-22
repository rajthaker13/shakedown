// Remove stored episode files whose run no longer exists.
//
//   node scripts/remove-orphaned-artifacts.mjs
//
// Reads Supabase credentials from apps/web/.env.local. Every run id is loaded,
// page by page, before anything is removed: the API returns at most 1000 rows
// per request, and a run missing from that list would have its files deleted.
import { readFileSync } from "node:fs";
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

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});
const bucket = db.storage.from("artifacts");
const PAGE = 1000;

function check(result, what) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data ?? [];
}

async function allRunIds() {
  const ids = new Set();
  for (let from = 0; ; from += PAGE) {
    const rows = check(
      await db.from("runs").select("id").order("id").range(from, from + PAGE - 1),
      "listing runs",
    );
    for (const row of rows) ids.add(row.id);
    if (rows.length < PAGE) return ids;
  }
}

async function listAll(prefix) {
  const entries = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = check(await bucket.list(prefix, { limit: PAGE, offset }), `listing ${prefix || "/"}`);
    entries.push(...page);
    if (page.length < PAGE) return entries;
  }
}

const live = await allRunIds();
let removed = 0;
for (const project of await listAll("")) {
  for (const run of await listAll(project.name)) {
    if (live.has(run.name)) continue;
    const base = `${project.name}/${run.name}/episodes`;
    for (const folder of await listAll(base)) {
      const files = await listAll(`${base}/${folder.name}`);
      for (let i = 0; i < files.length; i += PAGE) {
        const paths = files.slice(i, i + PAGE).map((f) => `${base}/${folder.name}/${f.name}`);
        check(await bucket.remove(paths), `removing files under ${base}/${folder.name}`);
        removed += paths.length;
      }
    }
  }
}
console.log(`removed ${removed} file(s) from runs that no longer exist (${live.size} runs kept)`);
