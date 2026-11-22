// End-to-end check of the product, driven through a real browser and the real CLI.
//
//   node e2e/flow.mjs
//
// Needs the web app on SHAKEDOWN_URL (default http://localhost:3400), the local
// database, the engine installed in engine/.venv, and Google Chrome.
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import puppeteer from "puppeteer-core";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const base = process.env.SHAKEDOWN_URL ?? "http://localhost:3400";
const chrome =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const stamp = Date.now().toString(36);
const email = `e2e-${stamp}@example.test`;
const other = `e2e-other-${stamp}@example.test`;
const password = `pw-${stamp}-Longer1`;

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `: ${detail}` : ""}`);
  }
}

async function text(page) {
  return page.evaluate(() => document.body.innerText);
}

async function submit(page, selector = 'main form button[type="submit"]') {
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }).catch(() => null),
    page.click(selector),
  ]);
}

async function signUp(browser, address) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`${base}/signup`, { waitUntil: "networkidle0" });
  await page.type("#name", "E2E Tester");
  await page.type("#email", address);
  await page.type("#password", password);
  await submit(page);
  await page.waitForFunction(() => location.pathname.startsWith("/app/"), { timeout: 30000 });
  return { context, page };
}

function cli(args, env = {}) {
  try {
    const out = execFileSync(join(root, "engine/.venv/bin/shakedown"), args, {
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

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  defaultViewport: { width: 1440, height: 900 },
});
try {
  console.log("Public pages");
  const anon = await (await browser.createBrowserContext()).newPage();
  const consoleErrors = [];
  anon.on("pageerror", (e) => consoleErrors.push(String(e)));
  for (const path of ["/", "/docs", "/docs/quickstart", "/contact", "/login", "/signup"]) {
    const response = await anon.goto(`${base}${path}`, { waitUntil: "networkidle0" });
    check(`GET ${path}`, response.status() === 200, `status ${response.status()}`);
  }
  check("no JavaScript errors on public pages", consoleErrors.length === 0, consoleErrors[0]);

  await anon.goto(`${base}/`, { waitUntil: "networkidle0" });
  const cells = await anon.$$('[role="gridcell"] button');
  check("landing page matrix has cells", cells.length > 10, `${cells.length} cells`);
  await cells[1].click();
  await anon.waitForSelector('aside[aria-label="Cell detail"]');
  check("selecting a cell opens its detail", true);
  await anon.keyboard.press("h");
  await anon.waitForFunction(() =>
    document.querySelector('[role="radio"][aria-checked="true"]')?.textContent.includes("Heatmap"),
  );
  check("keyboard shortcut switches to the heatmap", true);

  console.log("Contact form");
  await anon.goto(`${base}/contact`, { waitUntil: "networkidle0" });
  await anon.type("#contact-email", email);
  await anon.type("#contact-message", "e2e test message");
  await anon.click('form button[type="submit"]');
  await anon.waitForFunction(() => document.body.innerText.includes("has been received"));
  check("contact form stores a message", true);

  console.log("Sign up and create a project");
  const { page, context } = await signUp(browser, email);
  const orgSlug = new URL(page.url()).pathname.split("/")[2];
  check("sign up lands in a personal organization", Boolean(orgSlug), page.url());
  check("empty projects page explains itself", (await text(page)).includes("Create your first project"));

  await page.goto(`${base}/app/${orgSlug}/new`, { waitUntil: "networkidle0" });
  await page.type("#name", "E2E cell");
  await page.type("#slug", "e2e-cell");
  await submit(page);
  await page.waitForFunction(() => location.pathname.endsWith("/e2e-cell/settings"));
  check("creating a project opens its settings", true);

  console.log("API key");
  await page.type("#key-name", "e2e");
  await page.click('form:has(#key-name) button[type="submit"]');
  await page.waitForFunction(() => document.body.innerText.includes("will not be shown again"));
  const key = await page.evaluate(
    () => [...document.querySelectorAll("code")].map((c) => c.textContent).find((t) => t.startsWith("shk_")),
  );
  check("a new key is shown once", /^shk_[0-9a-f]{48}$/.test(key ?? ""), key);
  await page.reload({ waitUntil: "networkidle0" });
  check("the key is not shown again after reload", !(await text(page)).includes(key));

  console.log("CLI run with live upload");
  const env = { SHAKEDOWN_URL: base, SHAKEDOWN_API_KEY: key };
  for (const dir of ["e2e/out-a", "e2e/out-b"]) rmSync(join(root, dir), { recursive: true, force: true });
  const bad = cli(["run", "e2e/suite", "-p", "random", "--upload", "--no-progress", "-o", "e2e/out-x"], {
    SHAKEDOWN_URL: base,
    SHAKEDOWN_API_KEY: "shk_" + "0".repeat(48),
  });
  check("an unknown key is refused before anything runs", bad.code === 2 && bad.out.includes("Unknown API key"), bad.out.slice(-200));

  const first = cli(["run", "e2e/suite", "-p", "random", "-l", "rand-a", "--upload", "--no-progress", "-o", "e2e/out-a", "--videos", "all"], env);
  check("first run uploads", first.out.includes("dashboard:"), first.out.slice(-400));
  check("a failing assertion gives exit code 1", first.code === 1, `code ${first.code}`);
  check("a video was recorded", existsSync(join(root, "e2e/out-a/episodes/noise/1000.mp4")));

  const second = cli(["run", "e2e/suite", "-p", "random", "-l", "rand-b", "--upload", "--no-progress", "-o", "e2e/out-b", "--baseline", "e2e/out-a"], env);
  check("second run uploads with a baseline", second.out.includes("dashboard:"), second.out.slice(-400));

  const again = cli(["upload", "e2e/out-b"], env);
  check("uploading the same run again is accepted", again.code === 0, again.out.slice(-300));

  console.log("Dashboard");
  const project = `${base}/app/${orgSlug}/e2e-cell`;
  await page.goto(project, { waitUntil: "networkidle0" });
  const headers = await page.$$eval('[role="columnheader"]', (els) => els.map((e) => e.innerText));
  check("matrix has a column per policy", headers.some((h) => h.includes("rand-a")) && headers.some((h) => h.includes("rand-b")), headers.join(" | "));

  await page.goto(`${project}/runs`, { waitUntil: "networkidle0" });
  const runsText = await text(page);
  check("runs list shows both runs", runsText.includes("#1") && runsText.includes("#2"));

  await page.goto(`${project}/runs/2`, { waitUntil: "networkidle0" });
  const runText = await text(page);
  check("run page shows the baseline", runText.includes("rand-a"), runText.slice(0, 300));
  check("run page lists both conditions", runText.includes("nominal") && runText.includes("noise"));

  await page.goto(`${project}/runs/1/noise`, { waitUntil: "networkidle0" });
  const conditionText = await text(page);
  check("condition page shows the check and the scenario file", conditionText.includes("success_rate") && conditionText.includes("image_noise"));

  await page.goto(`${project}/runs/1/noise/1000`, { waitUntil: "networkidle0" });
  await page.waitForSelector("video");
  const video = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const el = document.querySelector("video");
        const done = () => resolve({ ok: el.videoWidth > 0, width: el.videoWidth, error: el.error?.message ?? null });
        if (el.readyState >= 1) done();
        else {
          el.addEventListener("loadedmetadata", done, { once: true });
          el.addEventListener("error", done, { once: true });
          setTimeout(done, 15000);
        }
      }),
  );
  check("replay video loads from private storage", video.ok, JSON.stringify(video));
  check("replay shows recorded signals", (await page.$$("svg path")).length >= 4);
  const before = await page.$eval('[role="slider"]', (el) => el.getAttribute("aria-valuenow"));
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const after = await page.$eval('[role="slider"]', (el) => el.getAttribute("aria-valuenow"));
  check("arrow keys step through the episode", Number(after) === Number(before) + 2, `${before} -> ${after}`);

  await page.goto(`${project}/compare?base=1&head=2&show=all`, { waitUntil: "networkidle0" });
  check("compare page reports a paired comparison", (await text(page)).includes("paired"));

  await page.goto(`${project}/scenarios`, { waitUntil: "networkidle0" });
  check("scenario viewer shows the file", (await text(page)).includes("noise.yaml"));

  await page.goto(`${project}/sim-to-real`, { waitUntil: "networkidle0" });
  check("sim-to-real page explains what to do first", (await text(page)).includes("No real-robot trials recorded yet"));

  console.log("Real-robot trials");
  const trials = join(root, "e2e/out-a/real.jsonl");
  const { writeFileSync } = await import("node:fs");
  const lines = [];
  for (const [key, wins] of [["nominal", 0], ["noise", 1]]) {
    for (let i = 0; i < 5; i += 1) {
      lines.push(JSON.stringify({ suite: "suite", condition_key: key, policy_label: "rand-a", trial: i, success: i < wins, robot: "so101" }));
    }
  }
  writeFileSync(trials, `${lines.join("\n")}\n`);
  const correlate = cli(["real", "correlate", "e2e/out-a", trials, "--upload"], env);
  check("real trials upload", correlate.code === 0 && correlate.out.includes("uploaded 10 trials"), correlate.out.slice(-300));
  await page.goto(`${project}/sim-to-real`, { waitUntil: "networkidle0" });
  const s2r = await text(page);
  check("sim-to-real page shows the trials and refuses to over-claim", s2r.includes("10 real trials") && s2r.includes("Not enough conditions to judge"), s2r.slice(0, 400));

  console.log("Access control");
  const stranger = await (await browser.createBrowserContext()).newPage();
  await stranger.goto(project, { waitUntil: "networkidle0" });
  check("a signed-out visitor is sent to sign in", new URL(stranger.url()).pathname === "/login", stranger.url());
  const videoUrl = await page.$eval("body", () => null).then(() => null);
  void videoUrl;
  const episodeId = await page.evaluate(async (url) => {
    const html = await (await fetch(url)).text();
    return /api\/artifacts\?episode=([0-9a-f-]{36})/.exec(html)?.[1] ?? null;
  }, `${project}/runs/1/noise/1000`);
  const direct = await stranger.goto(`${base}/api/artifacts?episode=${episodeId}`);
  check("a signed-out visitor cannot fetch a private video", direct.status() === 404, `status ${direct.status()}`);

  const second_user = await signUp(browser, other);
  const response = await second_user.page.goto(project, { waitUntil: "networkidle0" });
  check("another account cannot see the project", response.status() === 404, `status ${response.status()}`);
  const theirs = await second_user.page.goto(`${base}/api/artifacts?episode=${episodeId}`);
  check("another account cannot fetch its videos", theirs.status() === 404, `status ${theirs.status()}`);

  const demo = await stranger.goto(`${base}/demo`, { waitUntil: "networkidle0" });
  check("the public demo is readable without an account", demo.status() === 200 && new URL(stranger.url()).pathname.includes("aloha-transfer-cube"));
  // The page streams, so the status is already sent when access is decided.
  // What matters is that none of the settings are rendered.
  await stranger.goto(`${base}/app/shakedown/aloha-transfer-cube/settings`, { waitUntil: "networkidle0" });
  const demoSettings = await text(stranger);
  check(
    "the demo's settings are not",
    demoSettings.includes("do not have access") && !demoSettings.includes("API keys") && !demoSettings.includes("Delete this project"),
    demoSettings.slice(0, 200),
  );

  console.log("Revoking the key");
  await page.goto(`${project}/settings`, { waitUntil: "networkidle0" });
  page.once("dialog", (dialog) => dialog.accept("e2e"));
  await page.click('form:has(input[name="key_id"]) button[type="submit"]');
  await page.waitForFunction(() => document.body.innerText.includes("revoked"));
  const revoked = cli(["upload", "e2e/out-a"], env);
  check("a revoked key is refused", revoked.code === 2 && revoked.out.includes("revoked"), revoked.out.slice(-200));

  console.log("Deleting the project");
  await page.type("#confirm", "e2e-cell");
  await submit(page, 'form:has(#confirm) button[type="submit"]');
  await page.waitForFunction((slug) => location.pathname === `/app/${slug}`, {}, orgSlug);
  const gone = await page.goto(project, { waitUntil: "networkidle0" });
  check("a deleted project is gone", gone.status() === 404);

  await context.close();
} catch (error) {
  failures.push(`crashed: ${error.message}`);
  console.error(error);
} finally {
  await browser.close();
  for (const dir of ["e2e/out-a", "e2e/out-b", "e2e/out-x"]) rmSync(join(root, dir), { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
