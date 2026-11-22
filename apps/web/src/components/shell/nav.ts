import {
  ArrowLeftRight,
  FileCode2,
  FolderKanban,
  Grid3x3,
  Rocket,
  Satellite,
  ListChecks,
  Radar,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Second key of the "g then key" shortcut. */
  shortcut?: string;
  /** Match the path exactly rather than by prefix. */
  exact?: boolean;
};

export function projectNav(org: string, project: string, canWrite: boolean): NavItem[] {
  const base = `/app/${org}/${project}`;
  const items: NavItem[] = [
    { label: "Matrix", href: base, icon: Grid3x3, shortcut: "m", exact: true },
    { label: "Runs", href: `${base}/runs`, icon: ListChecks, shortcut: "r" },
    { label: "Compare", href: `${base}/compare`, icon: ArrowLeftRight, shortcut: "c" },
    { label: "Releases", href: `${base}/releases`, icon: Rocket, shortcut: "l" },
    { label: "Field", href: `${base}/field`, icon: Satellite, shortcut: "f" },
    { label: "Scenarios", href: `${base}/scenarios`, icon: FileCode2, shortcut: "s" },
    { label: "Sim to real", href: `${base}/sim-to-real`, icon: Radar, shortcut: "v" },
  ];
  if (canWrite) {
    items.push({ label: "Settings", href: `${base}/settings`, icon: Settings, shortcut: "k" });
  }
  return items;
}

export function orgNav(org: string): NavItem[] {
  return [
    { label: "Projects", href: `/app/${org}`, icon: FolderKanban, shortcut: "p", exact: true },
    { label: "Team", href: `/app/${org}/settings`, icon: Users, shortcut: "t" },
  ];
}
