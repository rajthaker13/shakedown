import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/cn";

import { highlightLine, type Lang } from "./highlight";

export function CodeBlock({
  code,
  lang = "text",
  filename,
  lineNumbers = false,
  anchorPrefix,
  className,
}: {
  code: string;
  lang?: Lang;
  filename?: string;
  lineNumbers?: boolean;
  /** When set, each line gets an id of `${anchorPrefix}L<n>` so it can be linked. */
  anchorPrefix?: string;
  className?: string;
}) {
  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <div className={cn("overflow-hidden rounded-md border border-line bg-inset", className)}>
      {filename ? (
        <div className="flex h-9 items-center justify-between border-b border-line-subtle pl-3 pr-1">
          <span className="truncate font-mono text-xs text-fg-secondary">{filename}</span>
          <CopyButton value={code} label={`Copy ${filename}`} />
        </div>
      ) : null}
      <div className="relative">
        {filename ? null : (
          <CopyButton value={code} label="Copy code" className="absolute right-1 top-1 bg-inset" />
        )}
        <pre className="overflow-x-auto py-3 font-mono text-[13px] leading-5">
          <code className="block w-max min-w-full">
            {lines.map((line, i) => (
              <span
                key={i}
                id={anchorPrefix ? `${anchorPrefix}L${i + 1}` : undefined}
                className="block px-4 target:bg-accent-subtle"
              >
                {lineNumbers ? (
                  <span
                    aria-hidden="true"
                    className="mr-4 inline-block w-6 select-none text-right text-fg-disabled tabular"
                  >
                    {i + 1}
                  </span>
                ) : null}
                {highlightLine(line, lang)}
                {"\n"}
              </span>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
