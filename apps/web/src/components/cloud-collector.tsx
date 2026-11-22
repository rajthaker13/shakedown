"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * While a cloud run is in progress, asks the server to collect what has
 * finished and refreshes the page. One request at a time.
 */
export function CloudCollector({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    async function tick() {
      if (stopped) return;
      let delay = 5000;
      if (document.visibilityState === "visible") {
        try {
          const response = await fetch(`/api/cloud/${jobId}/collect`, { method: "POST" });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            setProblem(body.error ?? "Could not reach the cloud runner.");
            delay = 15000;
          } else {
            setProblem(null);
            router.refresh();
            if (body.state === "completed" || body.state === "failed") return;
            // More is waiting when a full batch came back.
            if (body.collected >= 4) delay = 500;
          }
        } catch {
          setProblem("Could not reach the server.");
          delay = 15000;
        }
      }
      timer = window.setTimeout(tick, delay);
    }
    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [jobId, router]);

  if (!problem) return null;
  return (
    <p role="status" className="border-b border-warn-line bg-warn-subtle px-4 py-2 text-[13px] text-warn lg:px-6">
      {problem} Results will appear when it responds.
    </p>
  );
}
