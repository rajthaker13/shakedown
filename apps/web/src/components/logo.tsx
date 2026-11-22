import { brand } from "@/lib/brand";
import { cn } from "@/lib/cn";

/**
 * The mark is a small result matrix with one cell knocked out of line:
 * the condition that regressed.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("size-5 shrink-0", className)}
    >
      <rect x="2" y="2" width="9" height="9" rx="2" className="fill-fg" />
      <rect x="13" y="2" width="9" height="9" rx="2" className="fill-fg" opacity="0.35" />
      <rect x="2" y="13" width="9" height="9" rx="2" className="fill-fg" opacity="0.35" />
      <rect
        x="14.2"
        y="14.2"
        width="9"
        height="9"
        rx="2"
        transform="rotate(-9 18.7 18.7)"
        className="fill-accent"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-[-0.02em] text-fg">{brand.name}</span>
    </span>
  );
}
