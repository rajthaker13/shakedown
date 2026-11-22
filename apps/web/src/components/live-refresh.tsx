"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-fetches the page while a run is in progress, so results appear as the
 * CLI uploads them. Pauses while the tab is hidden.
 */
export function LiveRefresh({ active, intervalMs = 4000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs, router]);
  return null;
}
