import type { Metadata } from "next";

/**
 * The single source for the docs sidebar, the prev/next links and each page's
 * metadata. Reading order is the order of the items here.
 */
export type NavItem = {
  title: string;
  href: string;
  /** Used as the page's meta description. */
  description: string;
};

export type NavGroup = { label: string; items: NavItem[] };

export const docsNav: NavGroup[] = [
  {
    label: "Get started",
    items: [
      {
        title: "Introduction",
        href: "/docs",
        description:
          "What Shakedown is, who it is for, how a run works, and what it does not do.",
      },
      {
        title: "Quickstart",
        href: "/docs/quickstart",
        description:
          "Install the engine from source, write a starter suite, run it against a LeRobot checkpoint and compare a second run with a baseline.",
      },
    ],
  },
  {
    label: "Writing tests",
    items: [
      {
        title: "Scenarios",
        href: "/docs/scenarios",
        description:
          "The scenario file format: every field, sweeps, assertions, seeds and the fingerprint that decides whether two runs are paired.",
      },
      {
        title: "Perturbations",
        href: "/docs/perturbations",
        description:
          "Reference for every perturbation: what fault it models, its parameters, defaults and units, and which environments support it.",
      },
      {
        title: "Environments",
        href: "/docs/environments",
        description:
          "The built-in environments, their observation and action spaces, success criteria, recorded signals, and how to add an adapter.",
      },
      {
        title: "Policies",
        href: "/docs/policies",
        description:
          "Policy specs, inference options, device selection, and the HTTP policy protocol for testing a policy without sharing its weights.",
      },
    ],
  },
  {
    label: "Deploying",
    items: [
      {
        title: "Runtime settings",
        href: "/docs/runtime-settings",
        description:
          "What is deployed is a checkpoint together with its runtime settings. How to sweep them with shakedown tune, and exactly how shakedown recommend chooses.",
      },
      {
        title: "Releases and gates",
        href: "/docs/releases",
        description:
          "Release stages from candidate to fleet, the checks behind each promotion, overriding a gate, rollback, and how a robot asks which release to run.",
      },
      {
        title: "Field reporting",
        href: "/docs/field",
        description:
          "Report attempts from robots with the field SDK, what is measured and how, and the rules that turn field conditions into proposed tests.",
      },
      {
        title: "Cloud runs",
        href: "/docs/cloud-runs",
        description:
          "Run a hosted suite against a public Hugging Face model with one GPU container per condition: what can be tested, the limits, and how to host the runner yourself.",
      },
    ],
  },
  {
    label: "Reading results",
    items: [
      {
        title: "Statistics and verdicts",
        href: "/docs/statistics",
        description:
          "How PASS, WARN and FAIL are decided: Wilson intervals, the exact McNemar test, how many episodes to run, and first-divergence detection.",
      },
    ],
  },
  {
    label: "Automation",
    items: [
      {
        title: "Running in CI",
        href: "/docs/ci",
        description:
          "Exit codes, JUnit and Markdown reports, the GitHub job summary, uploads with a branch baseline, and a complete GitHub Actions workflow.",
      },
      {
        title: "CLI reference",
        href: "/docs/cli",
        description: "Every shakedown command with its arguments, options and defaults.",
      },
      {
        title: "API reference",
        href: "/docs/api",
        description:
          "Every route of the HTTP API under /api/v1: method, request body and response, authentication with a project key, and the rate limit.",
      },
      {
        title: "Dashboard",
        href: "/docs/dashboard",
        description:
          "Uploading runs, API keys, what leaves your machine, and the dashboard views.",
      },
    ],
  },
  {
    label: "Validity",
    items: [
      {
        title: "Sim-to-real validation",
        href: "/docs/sim-to-real",
        description:
          "Record trials on the real robot, compare them with a simulated run, and read the two metrics Shakedown computes: Pearson correlation and MMRV.",
      },
      {
        title: "Scanning a workcell",
        href: "/docs/scans",
        description:
          "Import a scanned mesh of a real workcell as collision and visual geometry, place it around a task with the scanned_scene perturbation, and know what a scan does not carry over.",
      },
      {
        title: "Limitations",
        href: "/docs/limitations",
        description:
          "What Shakedown results do and do not tell you about a policy on a real robot.",
      },
    ],
  },
];

export const docsPages: NavItem[] = docsNav.flatMap((group) => group.items);

export function getPage(href: string): NavItem {
  const page = docsPages.find((item) => item.href === href);
  if (!page) throw new Error(`No docs page is registered for ${href}`);
  return page;
}

export function getGroupLabel(href: string): string {
  const group = docsNav.find((g) => g.items.some((item) => item.href === href));
  return group ? group.label : "";
}

export function getPrevNext(href: string): { prev: NavItem | null; next: NavItem | null } {
  const index = docsPages.findIndex((item) => item.href === href);
  if (index < 0) return { prev: null, next: null };
  return {
    prev: index > 0 ? docsPages[index - 1] : null,
    next: index < docsPages.length - 1 ? docsPages[index + 1] : null,
  };
}

export function pageMetadata(href: string): Metadata {
  const page = getPage(href);
  const title = href === "/docs" ? "Documentation" : page.title;
  return {
    title,
    description: page.description,
    alternates: { canonical: href },
    openGraph: { title, description: page.description, type: "article" },
  };
}
