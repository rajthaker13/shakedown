import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/cn";

import { tokenize, type Lang } from "./highlight";

export type CodeBlockProps = {
  code: string;
  lang?: Lang;
  /** Shown in a header row, e.g. a file path or "Example output". */
  filename?: string;
  /** Used inside tabbed blocks, where the tab list is the frame. */
  bare?: boolean;
  className?: string;
};

export function CodeBlock({ code, lang = "text", filename, bare = false, className }: CodeBlockProps) {
  const source = code.replace(/\n+$/, "");
  const tokens = tokenize(source, lang);

  return (
    <div
      className={cn(
        "relative min-w-0 bg-inset",
        !bare && "my-6 overflow-hidden rounded-md border border-line",
        className,
      )}
    >
      {filename ? (
        <div className="flex h-10 items-center justify-between gap-4 border-b border-line pl-4 pr-1.5">
          <span className="truncate font-mono text-[12px] leading-4 text-fg-tertiary">
            {filename}
          </span>
          <CopyButton value={source} label="Copy code" />
        </div>
      ) : (
        <CopyButton
          value={source}
          label="Copy code"
          className="absolute right-1.5 top-1.5 bg-inset"
        />
      )}
      <pre
        tabIndex={0}
        aria-label={filename ?? "Code sample"}
        className={cn(
          "overflow-x-auto p-4 font-mono text-[13px] leading-5 text-fg-secondary",
          !filename && "pr-12",
        )}
      >
        <code>
          {tokens.map((token, index) =>
            token.className ? (
              <span key={index} className={token.className}>
                {token.text}
              </span>
            ) : (
              token.text
            ),
          )}
        </code>
      </pre>
    </div>
  );
}
