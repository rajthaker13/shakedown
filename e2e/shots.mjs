// Capture screenshots of the running app.
//   node e2e/shots.mjs <out-dir> [mobile]
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import puppeteer from "puppeteer-core";

const out = process.argv[2] ?? "shots";
const mobile = process.argv[3] === "mobile";
const base = process.env.SHAKEDOWN_URL ?? "http://localhost:3400";
const chrome =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const demo = "/app/shakedown/aloha-transfer-cube";
mkdirSync(out, { recursive: true });

const pages = (process.env.PAGES ?? "").split(",").filter(Boolean);
const all = {
  landing: "/",
  matrix: demo,
  "matrix-change": `${demo}?mode=delta`,
  "matrix-heatmap": `${demo}?mode=heatmap`,
  runs: `${demo}/runs`,
  compare: `${demo}/compare`,
  scenarios: `${demo}/scenarios`,
  docs: "/docs/quickstart",
  contact: "/contact",
  signup: "/signup",
};

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  defaultViewport: mobile
    ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { width: 1440, height: 900, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
for (const [name, path] of Object.entries(all)) {
  if (pages.length && !pages.includes(name)) continue;
  await page.goto(`${base}${path}`, { waitUntil: "networkidle0", timeout: 60000 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  await page.screenshot({
    path: join(out, `${name}${mobile ? "-mobile" : ""}.png`),
    fullPage: name === "landing" || name === "docs" || name === "contact",
  });
  console.log(`${name}${overflow > 0 ? `  horizontal overflow ${overflow}px` : ""}`);
}
await browser.close();
