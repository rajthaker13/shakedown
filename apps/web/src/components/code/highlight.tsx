import type { ReactNode } from "react";

/**
 * Small tokenizers for the languages shown in the product. They color text
 * and never change it: joining the tokens always gives back the input.
 */
export type Lang = "yaml" | "bash" | "python" | "json" | "text";

type Token = { text: string; kind?: "key" | "string" | "number" | "literal" | "comment" | "flag" | "var" };

const CLASS: Record<NonNullable<Token["kind"]>, string> = {
  key: "text-fg",
  string: "text-pass",
  number: "text-warn",
  literal: "text-info",
  comment: "text-fg-tertiary",
  flag: "text-running",
  var: "text-running",
};

function scan(line: string, rules: [RegExp, Token["kind"] | undefined][]): Token[] {
  const out: Token[] = [];
  let rest = line;
  while (rest.length) {
    let matched = false;
    for (const [pattern, kind] of rules) {
      const m = pattern.exec(rest);
      if (m && m.index === 0 && m[0].length) {
        out.push({ text: m[0], kind });
        rest = rest.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      const last = out[out.length - 1];
      if (last && !last.kind) last.text += rest[0];
      else out.push({ text: rest[0] });
      rest = rest.slice(1);
    }
  }
  return out;
}

const RULES: Record<Exclude<Lang, "text">, [RegExp, Token["kind"] | undefined][]> = {
  yaml: [
    [/^#.*/, "comment"],
    [/^\s+#.*/, "comment"],
    [/^"(?:[^"\\]|\\.)*"/, "string"],
    [/^'(?:[^'\\]|\\.)*'/, "string"],
    [/^\$\{[A-Za-z_][A-Za-z0-9_]*\}/, "var"],
    [/^[A-Za-z_][A-Za-z0-9_.-]*(?=\s*:(\s|$))/, "key"],
    [/^(?:true|false|null|yes|no)\b/, "literal"],
    [/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/i, "number"],
  ],
  json: [
    [/^"(?:[^"\\]|\\.)*"(?=\s*:)/, "key"],
    [/^"(?:[^"\\]|\\.)*"/, "string"],
    [/^(?:true|false|null)\b/, "literal"],
    [/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/i, "number"],
  ],
  bash: [
    [/^#.*/, "comment"],
    [/^\s+#.*/, "comment"],
    [/^"(?:[^"\\]|\\.)*"/, "string"],
    [/^'[^']*'/, "string"],
    [/^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/, "var"],
    [/^--?[A-Za-z][A-Za-z0-9-]*/, "flag"],
  ],
  python: [
    [/^#.*/, "comment"],
    [/^\s+#.*/, "comment"],
    [/^"""[\s\S]*?"""/, "string"],
    [/^f?"(?:[^"\\]|\\.)*"/, "string"],
    [/^f?'(?:[^'\\]|\\.)*'/, "string"],
    [/^(?:True|False|None)\b/, "literal"],
    [/^(?:def|class|import|from|return|if|else|elif|for|while|with|as|in|not|and|or|async|await|raise|try|except|lambda|yield)\b/, "flag"],
    [/^-?\d+(?:\.\d+)?\b/, "number"],
    [/^[A-Za-z_][A-Za-z0-9_]*/, undefined],
  ],
};

export function highlightLine(line: string, lang: Lang): ReactNode {
  if (lang === "text" || !line) return line;
  return scan(line, RULES[lang]).map((token, i) =>
    token.kind ? (
      <span key={i} className={CLASS[token.kind]}>
        {token.text}
      </span>
    ) : (
      token.text
    ),
  );
}
