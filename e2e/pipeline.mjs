// End-to-end check of the deployment pipeline: release gates, the robot's
// view of a release, field reports, tests proposed from the field, rollback.
//
//   node e2e/pipeline.mjs
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import puppeteer from "puppeteer-core";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const base = process.env.SHAKEDOWN_URL ?? "http://localhost:3400";
const chrome =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const stamp = Date.now().toString(36);
const email = `pipe-${stamp}@example.test`;
const password = `pw-${stamp}-Longer1`;

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `: ${String(detail).slice(0, 400)}` : ""}`);
  }
}
const text = (page) => page.evaluate(() => document.body.innerText);

function run(file, args, env = {}) {
  try {
    const out = execFileSync(file, args, {
      cwd: root,
      env: { ...process.env, ...env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}
const cli = (args, env) => run(join(root, "engine/.venv/bin/shakedown"), args, env);
const python = (args, env) => run(join(root, "engine/.venv/bin/python"), args, env);

async function submitIn(page, selector) {
  await page.evaluate((sel) => {
    const form = document.querySelector(sel);
    form.scrollIntoView({ block: "center" });
  }, selector);
  await page.click(`${selector} button[type="submit"]`);
}

// The test asks for a password reset on every run, and the limit is five an hour.
// Start each run with a clean count so that repeated runs do not trip it.
if (process.env.SHAKEDOWN_DB_URL !== "") {
  const db = process.env.SHAKEDOWN_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
  try {
    execFileSync("psql", [db, "-q", "-c", "delete from public.rate_limits where bucket like 'reset:%'"]);
  } catch {
    console.log("  note: could not clear the rate limit count; the reset check may be refused");
  }
}

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  defaultViewport: { width: 1440, height: 1000 },
});
try {
  const page = await (await browser.createBrowserContext()).newPage();
  page.setDefaultTimeout(30000);

  console.log("Account pages");
  for (const path of ["/forgot", "/login"]) {
    const response = await page.goto(`${base}${path}`, { waitUntil: "networkidle0" });
    check(`GET ${path}`, response.status() === 200);
  }
  await page.goto(`${base}/reset`, { waitUntil: "networkidle0" });
  check("the reset page needs a link from an email", new URL(page.url()).pathname === "/forgot");
  await page.type("#email", "nobody@example.test");
  await page.click('main form button[type="submit"]');
  await page.waitForFunction(() => document.body.innerText.includes("If that address has an account"));
  check("asking for a reset does not reveal whether an account exists", true);

  console.log("Set up");
  await page.goto(`${base}/signup`, { waitUntil: "networkidle0" });
  await page.type("#email", email);
  await page.type("#password", password);
  await page.click('main form button[type="submit"]');
  await page.waitForFunction(() => location.pathname.startsWith("/app/"));
  const org = new URL(page.url()).pathname.split("/")[2];
  await page.goto(`${base}/app/${org}/new`, { waitUntil: "networkidle0" });
  await page.type("#name", "Pipeline");
  await page.type("#slug", "pipeline");
  await page.click('main form button[type="submit"]');
  await page.waitForFunction(() => location.pathname.endsWith("/pipeline/settings"));
  await page.type("#key-name", "e2e");
  await page.click('form:has(#key-name) button[type="submit"]');
  await page.waitForFunction(() => document.body.innerText.includes("will not be shown again"));
  const key = await page.evaluate(
    () => [...document.querySelectorAll("code")].map((c) => c.textContent).find((t) => t.startsWith("shk_")),
  );
  const env = { SHAKEDOWN_URL: base, SHAKEDOWN_API_KEY: key };
  const project = `${base}/app/${org}/pipeline`;

  await page.goto(`${project}/runs/new`, { waitUntil: "networkidle0" });
  const newRun = await text(page);
  check("the new-run page offers the cloud and the local route", newRun.includes("Run in the cloud") && newRun.includes("Run on your own machine"));
  check("it says what the cloud cannot test", newRun.includes("trained on a real robot cannot be tested here"));

  for (const dir of ["e2e/out-p1", "e2e/out-p2"]) rmSync(join(root, dir), { recursive: true, force: true });
  const first = cli(["run", "e2e/suite", "-p", "random", "-l", "v1", "--upload", "--no-progress", "-o", "e2e/out-p1", "--videos", "none"], env);
  check("a test run uploads", first.out.includes("dashboard:"), first.out.slice(-300));

  console.log("Release gates");
  const none = cli(["release", "--channel", "fleet"], env);
  check("with no release, the robot is told so", none.code === 1 && none.out.includes("No release"), none.out);

  await page.goto(`${project}/runs/1`, { waitUntil: "networkidle0" });
  await submitIn(page, 'form:has(input[name="run_id"][value]):has(input[name="next"][value$="/releases"])');
  await page.waitForFunction(() => location.pathname.endsWith("/releases"));
  // The page streams in: wait for the content, not only the address.
  await page.waitForFunction(() => document.body.innerText.includes("CANDIDATE"));
  let body = await text(page);
  check("a release is created as a candidate", body.includes("#1") && body.includes("CANDIDATE"), body.slice(0, 300));
  check("the gate shows what is not met", body.includes("No condition failed") && body.includes("episodes per condition"));

  // The run has 3 episodes per condition and a failed assertion, so the gate must refuse.
  const promote = 'form:has(input[name="to"][value="canary"])';
  check("an unmet gate asks for a reason", (await page.$(`${promote} input[name="reason"]`)) !== null);
  await page.type(`${promote} input[name="reason"]`, "short");
  await page.click(`${promote} input[name="override"]`);
  await page.click(`${promote} button[type="submit"]`);
  // The browser refuses to submit a reason this short; the server has the same rule.
  const tooShort = await page.$eval(`${promote} input[name="reason"]`, (el) => !el.checkValidity());
  check("a short reason is refused", tooShort);
  await page.type(`${promote} input[name="reason"]`, " trial on the bench arm only, agreed with the team");
  await page.click(`${promote} button[type="submit"]`);
  await page.waitForFunction(() => document.body.innerText.includes("CANARY"));
  body = await text(page);
  check("with a reason, the release becomes a canary", body.includes("CANARY"));
  await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("History"));
  await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
  check("the override is on the record", (await text(page)).toLowerCase().includes("gate overridden"));

  console.log("The robot's side");
  const canary = cli(["release", "--channel", "canary", "--json"], env);
  check("robots on the canary channel get release 1", canary.code === 0 && JSON.parse(canary.out).number === 1, canary.out);
  const fleet = cli(["release", "--channel", "fleet"], env);
  check("robots on the fleet channel get nothing yet", fleet.code === 1);

  const reported = python(["e2e/report_field.py", "canary", "40", "0.85", "220"], env);
  check("a robot reports 40 attempts through the SDK", reported.code === 0 && reported.out.includes("reported 40"), reported.out.slice(-300));
  const again = python(["e2e/report_field.py", "canary", "5", "1.0", "220"], env);
  check("more reports are accepted", again.code === 0, again.out.slice(-300));

  console.log("Field");
  await page.goto(`${project}/field`, { waitUntil: "networkidle0" });
  body = await text(page);
  check("the field page counts the attempts", body.includes("45 attempts reported"), body.slice(0, 200));
  check("it shows success and interventions", /interventions/i.test(body) && body.includes("arm-0"));
  check("it shows the measured delay", /2\d\d ms/.test(body), body.slice(0, 600));
  check("a delay test is proposed, because the suite tests no delay", body.includes("Test action delay up to") && body.includes("action_latency"));
  check("no exposure test is proposed from six failures", !body.includes("association"));
  const before = (body.match(/I have added it/g) ?? []).length;
  await page.click('form:has(input[name="status"][value="dismissed"]) button[type="submit"]');
  await page.waitForFunction(
    (n) => (document.body.innerText.match(/I have added it/g) ?? []).length === n - 1,
    {},
    before,
  );
  check("a proposal can be dismissed", true);
  const more = python(["e2e/report_field.py", "canary", "3", "1.0", "220"], env);
  await page.reload({ waitUntil: "networkidle0" });
  check("a dismissed proposal does not come back", more.code === 0 && ((await text(page)).match(/I have added it/g) ?? []).length === before - 1);

  console.log("Promotion to the fleet, and rollback");
  await page.goto(`${project}/releases`, { waitUntil: "networkidle0" });
  body = await text(page);
  check("the field gate is met with 48 attempts", body.includes("48 reported so far"), body.slice(0, 900));
  const toFleet = 'form:has(input[name="to"][value="fleet"])';
  check("a met gate asks for no reason", (await page.$(`${toFleet} input[name="reason"]`)) === null);
  await page.click(`${toFleet} button[type="submit"]`);
  await page.waitForFunction(() => document.body.innerText.includes("is now fleet") || document.body.innerText.includes("FLEET"));
  check("robots on the fleet channel now get release 1", JSON.parse(cli(["release", "--channel", "fleet", "--json"], env).out).number === 1);

  const second = cli(["run", "e2e/suite", "-p", "random", "-l", "v2", "--upload", "--no-progress", "-o", "e2e/out-p2", "--videos", "none", "--baseline", "e2e/out-p1"], env);
  check("a second run uploads", second.out.includes("dashboard:"), second.out.slice(-300));
  await page.goto(`${project}/runs/2`, { waitUntil: "networkidle0" });
  await submitIn(page, 'form:has(input[name="next"][value$="/releases"])');
  await page.waitForFunction(() => location.pathname.endsWith("/releases"));
  await page.waitForFunction(() => document.body.innerText.includes("CANDIDATE"));
  // Release 2: candidate to canary by override, then a poor showing in the field.
  await page.type(`${promote} input[name="reason"]`, "second trial on the bench arm, agreed with the team");
  await page.click(`${promote} input[name="override"]`);
  await page.click(`${promote} button[type="submit"]`);
  await page.waitForFunction(() => document.body.innerText.includes("is now canary"));
  check("release 2 becomes the canary", JSON.parse(cli(["release", "--channel", "canary", "--json"], env).out).number === 2);
  const poor = python(["e2e/report_field.py", "canary", "40", "0.5", "220"], env);
  check("the canary does badly in the field", poor.code === 0, poor.out.slice(-200));
  await page.goto(`${project}/field`, { waitUntil: "networkidle0" });
  check(
    "with enough failures, an exposure test is proposed and called an association",
    (await text(page)).includes("association"),
  );
  await page.goto(`${project}/releases`, { waitUntil: "networkidle0" });
  body = await text(page);
  check("the gate refuses a canary that is clearly worse than the fleet", body.includes("Not worse than the fleet release") && /Canary 50% over 40, fleet \(#1\) \d+% over 48, p = 0\.0/.test(body), body.slice(0, 1500));
  check("so promotion needs an override", (await page.$(`${toFleet} input[name="reason"]`)) !== null);

  const back = 'form:has(input[name="to"][value="rolled_back"])';
  const forms = await page.$$(back);
  await (await forms[0].$('input[name="reason"]')).type("half the attempts failed on the line");
  await (await forms[0].$('button[type="submit"]')).click();
  await page.waitForFunction(() => document.body.innerText.includes("ROLLED BACK"));
  check("the canary is rolled back", true);
  check("the fleet release is untouched", JSON.parse(cli(["release", "--channel", "fleet", "--json"], env).out).number === 1);
  check("the canary channel falls back to the fleet release", JSON.parse(cli(["release", "--channel", "canary", "--json"], env).out).number === 1);

  console.log("Limits on the API");
  const bad = await page.evaluate(async (url, k) => {
    const r = await fetch(`${url}/api/v1/field/episodes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
      body: JSON.stringify({ episodes: [{ id: "x", policy_label: "v1", success: true, release: 99 }] }),
    });
    return { status: r.status, body: await r.text() };
  }, base, key);
  check("a report for a release that does not exist is refused", bad.status === 400 && bad.body.includes("no release #99"), bad.body);
} catch (error) {
  failures.push(`crashed: ${error.message}`);
  console.error(error);
} finally {
  await browser.close();
  for (const dir of ["e2e/out-p1", "e2e/out-p2"]) rmSync(join(root, dir), { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
