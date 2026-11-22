// End-to-end check of a cloud run started from the website.
//
//   node e2e/cloud.mjs
//
// Uses the cloud runner configured in apps/web/.env.local and costs a little
// GPU time: 6 conditions of 5 episodes each.
import puppeteer from "puppeteer-core";

const base = process.env.SHAKEDOWN_URL ?? "http://localhost:3400";
const chrome =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const stamp = Date.now().toString(36);
const started = Date.now();
let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed += 1;
  else failures.push(name);
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${!ok && detail ? `: ${String(detail).slice(0, 400)}` : ""}`);
}
const text = (page) => page.evaluate(() => document.body.innerText);

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  defaultViewport: { width: 1440, height: 1000 },
});
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`${base}/signup`, { waitUntil: "networkidle0" });
  await page.type("#email", `cloud-${stamp}@example.test`);
  await page.type("#password", `pw-${stamp}-Longer1`);
  await page.click('main form button[type="submit"]');
  await page.waitForFunction(() => location.pathname.startsWith("/app/"));
  const org = new URL(page.url()).pathname.split("/")[2];
  await page.goto(`${base}/app/${org}/new`, { waitUntil: "networkidle0" });
  await page.type("#name", "Cloud");
  await page.type("#slug", "cloud");
  await page.click('main form button[type="submit"]');
  await page.waitForFunction(() => location.pathname.endsWith("/cloud/settings"));
  const project = `${base}/app/${org}/cloud`;

  await page.goto(`${project}/runs/new`, { waitUntil: "networkidle0" });
  await page.type("#model", "not a model");
  await page.click('form:has(#model) button[type="submit"]');
  await page.waitForFunction(() => document.body.innerText.includes("owner/name"));
  check("a malformed model name is refused", true);

  // Start again from a fresh form.
  await page.goto(`${project}/runs/new`, { waitUntil: "networkidle0" });
  await page.type("#model", "lerobot/act_aloha_sim_transfer_cube_human");
  await page.select("#suite", "aloha-latency");
  await page.click("#episodes", { clickCount: 3 });
  await page.type("#episodes", "5");
  await page.type("#n_action_steps", "50");
  await page.click('input[name="latency_compensation"]');
  const invalid = await page.$$eval("form:has(#model) :invalid", (els) => els.map((e) => e.id || e.name));
  if (invalid.length) console.log("  invalid fields:", invalid.join(", "));
  await page.click('form:has(#model) button[type="submit"]');
  await page.waitForFunction(() => /\/runs\/\d+$/.test(location.pathname), { timeout: 60000 });
  check("the run starts and its page opens", true);
  console.log(`  started after ${Math.round((Date.now() - started) / 1000)}s`);

  await page.waitForFunction(() => document.body.innerText.includes("RUNNING"), { timeout: 60000 });
  check("the run shows as running", true);

  // The page collects results by itself while it is open.
  let first = null;
  const deadline = Date.now() + 40 * 60 * 1000;
  let body = "";
  while (Date.now() < deadline) {
    body = await text(page);
    const done = (body.match(/\d+\/5\n/g) ?? []).length;
    if (done && first === null) {
      first = Date.now();
      console.log(`  first condition after ${Math.round((first - started) / 1000)}s`);
    }
    if (!body.includes("RUNNING")) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log(`  finished after ${Math.round((Date.now() - started) / 1000)}s`);
  check("the run finishes", !body.includes("RUNNING") && !body.includes("cloud run failed"), body.slice(0, 500));
  check("all six conditions arrive", (body.match(/latency|nominal/g) ?? []).length >= 6 && !body.includes("queued"));
  check("the runtime settings are recorded with the run", body.includes("n_action_steps=50") && body.includes("latency_compensation=auto"));

  await page.goto(`${project}/runs/1/${encodeURIComponent("latency@10")}`, { waitUntil: "networkidle0" });
  const seeds = await page.$$eval('a[href*="/latency%4010/"]', (links) => links.map((a) => a.href));
  check("episodes are listed", seeds.length >= 5, seeds.length);
  await page.goto(seeds[0], { waitUntil: "networkidle0" });
  check("an episode's signals were collected from the cloud", (await page.$$("svg path")).length >= 4);

  await page.goto(`${project}/runs/new`, { waitUntil: "networkidle0" });
  check("the allowance went down by 30 episodes", (await text(page)).includes("4,970 of 5,000"));

  await page.goto(`${project}/runs/1`, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.querySelector('form:has(input[name="next"][value$="/releases"])').scrollIntoView());
  await page.click('form:has(input[name="next"][value$="/releases"]) button[type="submit"]');
  await page.waitForFunction(() => location.pathname.endsWith("/releases"));
  await page.waitForFunction(() => document.body.innerText.includes("CANDIDATE"));
  check("a release made from it carries the runtime settings", (await text(page)).includes("n_action_steps=50"));
} catch (error) {
  failures.push(`crashed: ${error.message}`);
  console.error(error);
} finally {
  await browser.close();
}
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
