/**
 * Everything that names the product lives here, so the name can be changed
 * in one place.
 */
export const brand = {
  name: "Shakedown",
  cli: "shakedown",
  package: "shakedown-ci",
  tagline: "Regression testing for learned robot policies",
  description:
    "Shakedown runs a robot policy checkpoint and its runtime settings through seeded scenarios in simulation and reports, per condition, whether it passes, with a 95% interval, a paired comparison against a baseline, and a replay of every failure.",
  keyPrefix: "shk_",
  /** Public source repository. Leave empty until one exists; links are hidden when empty. */
  repo: process.env.NEXT_PUBLIC_REPO_URL ?? "",
} as const;

export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3400").replace(
  /\/$/,
  "",
);
