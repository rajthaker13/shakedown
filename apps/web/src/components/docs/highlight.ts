/**
 * Lightweight syntax coloring for code samples.
 *
 * Each language is a list of sticky regular expressions tried in order at the
 * current position. When none matches, one character is emitted unstyled. The
 * scanner only ever slices the input, so the concatenated tokens always equal
 * the input exactly.
 */
export type Lang = "yaml" | "shell" | "python" | "json" | "text";

export type Token = { text: string; className: string | null };

type Rule = readonly [pattern: RegExp, className: string | null];

const KEY = "text-fg";
const STRING = "text-pass";
const NUMBER = "text-warn";
const CONSTANT = "text-info";
const COMMENT = "text-fg-tertiary";
const FLAG = "text-running";

const NUMBER_RE = /(?<![\w.-])-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?![\w.-])/y;
const DOUBLE_QUOTED = /"(?:[^"\\\n]|\\.)*"/y;
const SINGLE_QUOTED = /'(?:[^'\\\n]|\\.)*'/y;

const yaml: Rule[] = [
  [/(?<=^|[ \t])#.*/my, COMMENT],
  [DOUBLE_QUOTED, STRING],
  [/'[^'\n]*'/y, STRING],
  [/[A-Za-z_][\w.-]*(?=[ \t]*:(?:[ \t]|$))/my, KEY],
  [/(?<![\w.-])(?:true|false|null)(?![\w.-])/y, CONSTANT],
  [NUMBER_RE, NUMBER],
  // A plain scalar after a block-level key runs to the end of the line.
  [/(?<=^[ \t]*(?:-[ \t]+)?[\w.-]+:[ \t]+)(?![{["'|>&*!#])[^\n#]*[^\s#]/my, STRING],
  [/[A-Za-z_][\w./@-]*/y, STRING],
];

const json: Rule[] = [
  [/"(?:[^"\\\n]|\\.)*"(?=\s*:)/y, KEY],
  [DOUBLE_QUOTED, STRING],
  [/(?<![\w.-])(?:true|false|null)(?![\w.-])/y, CONSTANT],
  [NUMBER_RE, NUMBER],
];

const shell: Rule[] = [
  [/(?<=^|[ \t])#.*/my, COMMENT],
  [DOUBLE_QUOTED, STRING],
  [SINGLE_QUOTED, STRING],
  [/(?<=^[ \t]*)[A-Za-z_][\w.-]*(?=[ \t]|$)/my, KEY],
  [/(?<=^|[ \t])--?[A-Za-z][\w-]*/my, FLAG],
  [NUMBER_RE, NUMBER],
  [/[^\s"'#]+/y, null],
];

const PY_KEYWORDS =
  "and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|" +
  "global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield";

const python: Rule[] = [
  [/#.*/y, COMMENT],
  [/(?<!\w)[rRbBfF]{0,2}(?:"""[\s\S]*?"""|'''[\s\S]*?''')/y, STRING],
  [/(?<!\w)[rRbBfF]{0,2}(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')/y, STRING],
  [/@[A-Za-z_][\w.]*/y, FLAG],
  [new RegExp(`(?<![\\w.])(?:${PY_KEYWORDS})(?!\\w)`, "y"), KEY],
  [/(?<![\w.])(?:True|False|None)(?!\w)/y, CONSTANT],
  [NUMBER_RE, NUMBER],
  [/[A-Za-z_]\w*/y, null],
];

const RULES: Record<Lang, Rule[]> = { yaml, json, shell, python, text: [] };

export function tokenize(code: string, lang: Lang): Token[] {
  const rules = RULES[lang];
  if (rules.length === 0) return code ? [{ text: code, className: null }] : [];

  const tokens: Token[] = [];
  let plain = "";
  let i = 0;

  const flush = () => {
    if (plain) {
      tokens.push({ text: plain, className: null });
      plain = "";
    }
  };

  while (i < code.length) {
    let matched = "";
    let className: string | null = null;
    for (const [pattern, cls] of rules) {
      pattern.lastIndex = i;
      const m = pattern.exec(code);
      if (m && m.index === i && m[0].length > 0) {
        matched = m[0];
        className = cls;
        break;
      }
    }
    if (!matched) {
      plain += code[i];
      i += 1;
      continue;
    }
    if (className === null) {
      plain += matched;
    } else {
      flush();
      tokens.push({ text: matched, className });
    }
    i += matched.length;
  }
  flush();
  return tokens;
}
