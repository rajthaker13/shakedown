import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-medium " +
  "transition-[background-color,border-color,color] duration-100 " +
  "disabled:pointer-events-none disabled:text-fg-disabled disabled:opacity-60 " +
  "aria-disabled:pointer-events-none aria-disabled:opacity-60";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-active " +
    "shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]",
  secondary:
    "border border-line bg-raised text-fg hover:border-line-strong hover:bg-overlay " +
    "active:bg-active",
  ghost: "text-fg-secondary hover:bg-raised hover:text-fg active:bg-active",
  danger:
    "border border-fail-line bg-fail-subtle text-fail hover:bg-fail-solid hover:text-on-accent " +
    "hover:border-fail-solid",
};

const sizes: Record<Size, string> = {
  sm: "h-7 rounded-sm px-2.5 text-[13px]",
  md: "h-8 rounded-sm px-3 text-[13px]",
  lg: "h-10 rounded-md px-4 text-sm",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size };

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

type LinkButtonProps = ComponentProps<typeof Link> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
};

export function LinkButton({ variant, size, className, ...props }: LinkButtonProps) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
