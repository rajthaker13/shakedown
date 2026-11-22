export function pct(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return "–";
  return `${(value * 100).toFixed(digits)}%`;
}

/** Signed change in percentage points, e.g. "-12" or "+4". */
export function points(delta: number | null | undefined): string {
  if (delta == null || Number.isNaN(delta)) return "–";
  const v = Math.round(delta * 100);
  if (v === 0) return "0";
  return v > 0 ? `+${v}` : `−${Math.abs(v)}`;
}

export function pValue(p: number | null | undefined): string {
  if (p == null || Number.isNaN(p)) return "–";
  if (p < 0.001) return "< 0.001";
  return p.toFixed(3);
}

export function duration(seconds: number | null | undefined): string {
  if (seconds == null) return "–";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "–";
  const diff = (new Date(iso).getTime() - now) / 1000;
  const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of units) {
    if (Math.abs(diff) >= size) return fmt.format(Math.round(diff / size), unit);
  }
  return "just now";
}

export function absoluteTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(iso)) + " UTC";
}

export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : "–";
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
