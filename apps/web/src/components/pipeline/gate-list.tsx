import { CheckCircle2, XCircle } from "lucide-react";

import type { GateCheck } from "@/lib/pipeline/gates";

export function GateList({ checks }: { checks: GateCheck[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {checks.map((check) => (
        <li key={check.id} className="flex items-start gap-2.5">
          {check.ok ? (
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-pass" />
          ) : (
            <XCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fail" />
          )}
          <div className="min-w-0 text-[13px]">
            <p className="text-fg">
              <span className="sr-only">{check.ok ? "Met: " : "Not met: "}</span>
              {check.label}
            </p>
            <p className="text-fg-secondary">{check.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
