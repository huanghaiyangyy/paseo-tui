/**
 * Dracula Transparent theme helpers.
 * Uses ANSI SGR only — no opaque full-screen backgrounds so Ghostty
 * background-opacity / blur can show through.
 */

import type { MarkdownTheme } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import hljs from "highlight.js";

export const Dracula = {
  bg: "#282a36",
  fg: "#f8f8f2",
  cyan: "#8be9fd",
  green: "#50fa7b",
  purple: "#bd93f9",
  pink: "#ff79c6",
  comment: "#6272a4",
  orange: "#ffb86c",
  red: "#ff5555",
  yellow: "#f1fa8c",
} as const;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  };
}

const RESET = "\x1b[0m";

function fg(hex: string): (text: string) => string {
  const { r, g, b } = hexToRgb(hex);
  return (text: string) => `\x1b[38;2;${r};${g};${b}m${text}${RESET}`;
}

/** Optional faint background tint — prefer avoiding for full-screen paint. */
function softBg(hex: string): (text: string) => string {
  const { r, g, b } = hexToRgb(hex);
  return (text: string) => `\x1b[48;2;${r};${g};${b}m${text}${RESET}`;
}

export const ansi = {
  reset: RESET,
  bold: (text: string) => `\x1b[1m${text}${RESET}`,
  dim: (text: string) => `\x1b[2m${text}${RESET}`,
  italic: (text: string) => `\x1b[3m${text}${RESET}`,
  fg: {
    fg: fg(Dracula.fg),
    cyan: fg(Dracula.cyan),
    green: fg(Dracula.green),
    purple: fg(Dracula.purple),
    pink: fg(Dracula.pink),
    comment: fg(Dracula.comment),
    orange: fg(Dracula.orange),
    red: fg(Dracula.red),
    yellow: fg(Dracula.yellow),
  },
  /** Only for small accents (e.g. selection highlight), not full-screen. */
  softBg: softBg(Dracula.bg),
};

export const editorTheme = {
  borderColor: ansi.fg.purple,
  selectList: {
    // Library hardcodes "→ "; pink selectedText is the visible highlight.
    selectedPrefix: (text: string) => ansi.fg.pink(`› ${text}`),
    selectedText: ansi.fg.pink,
    description: ansi.fg.comment,
    scrollInfo: ansi.fg.comment,
    noMatch: ansi.fg.orange,
  },
};

/** Map highlight.js token class → Dracula ANSI painter. */
const HLJS_TOKEN_COLOR: Record<string, (t: string) => string> = {
  keyword: ansi.fg.pink,
  built_in: ansi.fg.cyan,
  type: ansi.fg.cyan,
  literal: ansi.fg.purple,
  number: ansi.fg.orange,
  string: ansi.fg.yellow,
  regexp: ansi.fg.yellow,
  comment: ansi.fg.comment,
  doctag: ansi.fg.comment,
  meta: ansi.fg.comment,
  title: ansi.fg.green,
  "title.class": ansi.fg.cyan,
  "title.function": ansi.fg.green,
  attr: ansi.fg.green,
  attribute: ansi.fg.green,
  variable: ansi.fg.fg,
  "variable.language": ansi.fg.purple,
  "variable.constant": ansi.fg.purple,
  symbol: ansi.fg.purple,
  bullet: ansi.fg.cyan,
  code: ansi.fg.fg,
  addition: ansi.fg.green,
  deletion: ansi.fg.red,
  selector_id: ansi.fg.purple,
  selector_class: ansi.fg.green,
  selector_tag: ansi.fg.pink,
  selector_attr: ansi.fg.green,
  selector_pseudo: ansi.fg.pink,
  template_tag: ansi.fg.pink,
  template_variable: ansi.fg.orange,
  section: ansi.fg.purple,
  name: ansi.fg.green,
  params: ansi.fg.fg,
  property: ansi.fg.cyan,
  punctuation: ansi.fg.fg,
  operator: ansi.fg.pink,
  subst: ansi.fg.fg,
  tag: ansi.fg.pink,
};

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCharCode(Number.parseInt(h, 16)),
    );
}

/**
 * Convert highlight.js HTML (`<span class="hljs-…">…</span>`) to ANSI.
 * Nested spans are supported; unknown classes fall through as plain text.
 */
export function hljsHtmlToAnsi(html: string): string {
  let out = "";
  const stack: Array<(t: string) => string> = [];
  const re = /<\/?span\b[^>]*>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const chunk = decodeHtmlEntities(html.slice(last, m.index));
    if (chunk) {
      const paint = stack[stack.length - 1];
      out += paint ? paint(chunk) : chunk;
    }
    const tag = m[0];
    if (tag.startsWith("</")) {
      stack.pop();
    } else {
      const classMatch = tag.match(/class="([^"]*)"/);
      const classes = classMatch?.[1]?.split(/\s+/) ?? [];
      let painter: ((t: string) => string) | undefined;
      for (const c of classes) {
        const key = c.startsWith("hljs-") ? c.slice(5) : c;
        if (key && key !== "hljs" && HLJS_TOKEN_COLOR[key]) {
          painter = HLJS_TOKEN_COLOR[key];
          break;
        }
        // Try dotted prefixes stripped one by one: title.function → title
        const base = key.split(".")[0];
        if (base && HLJS_TOKEN_COLOR[base]) {
          painter = HLJS_TOKEN_COLOR[base];
          break;
        }
      }
      stack.push(painter ?? ((t: string) => t));
    }
    last = m.index + tag.length;
  }
  const tail = decodeHtmlEntities(html.slice(last));
  if (tail) {
    const paint = stack[stack.length - 1];
    out += paint ? paint(tail) : tail;
  }
  return out;
}

function normalizeLang(lang?: string): string | undefined {
  if (!lang) return undefined;
  const l = lang.trim().toLowerCase();
  const aliases: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    sh: "bash",
    shell: "bash",
    zsh: "bash",
    py: "python",
    rb: "ruby",
    yml: "yaml",
    md: "markdown",
  };
  return aliases[l] ?? l;
}

/**
 * MarkdownTheme.highlightCode — returns ANSI-styled lines.
 * Unknown / missing languages still soft-style via codeBlock.
 */
export function highlightCode(code: string, lang?: string): string[] {
  const raw = code.replace(/\n$/, "");
  const lines = raw.length === 0 ? [""] : raw.split("\n");
  const language = normalizeLang(lang);

  if (language && hljs.getLanguage(language)) {
    try {
      const result = hljs.highlight(raw, { language, ignoreIllegals: true });
      return result.value.split("\n").map((line) => hljsHtmlToAnsi(line));
    } catch {
      // fall through to soft style
    }
  }

  // Soft fallback: still paint via codeBlock (fg), no crash on unknown lang.
  return lines.map((line) => ansi.fg.fg(line));
}

/** ```lang border with muted ticks + pink/purple lang accent. */
function styleCodeBlockBorder(text: string): string {
  const m = /^(```+)(\S*)(.*)$/.exec(text);
  if (!m) return ansi.fg.comment(text);
  const [, ticks, lang, rest] = m;
  if (lang) {
    return (
      ansi.fg.comment(ticks) +
      ansi.fg.pink(ansi.bold(lang)) +
      (rest ? ansi.fg.comment(rest) : "")
    );
  }
  return ansi.fg.comment(ticks + (rest ?? ""));
}

/** Dracula MarkdownTheme for agent replies (no opaque backgrounds). */
export const markdownTheme: MarkdownTheme = {
  // Pink headings; library adds underline for H1 and bold for H1/H2.
  heading: (text) => ansi.fg.pink(text),
  link: (text) => ansi.fg.cyan(text),
  linkUrl: (text) => ansi.fg.comment(text),
  code: (text) => ansi.fg.pink(text),
  codeBlock: (text) => ansi.fg.fg(text),
  codeBlockBorder: styleCodeBlockBorder,
  quote: (text) => ansi.fg.comment(ansi.italic(text)),
  quoteBorder: (text) => ansi.fg.purple(ansi.bold(text)),
  hr: (text) => ansi.fg.comment(text),
  listBullet: (text) => ansi.fg.cyan(text),
  bold: (text) => ansi.bold(text),
  italic: (text) => ansi.italic(text),
  strikethrough: (text) => `\x1b[9m${text}${RESET}`,
  underline: (text) => `\x1b[4m${text}${RESET}`,
  codeBlockIndent: ansi.fg.comment("│ "),
  highlightCode,
};

export const markdownDefaultStyle = {
  color: ansi.fg.fg,
};

/** Compact chip for header/status (muted key, bright value). */
export function chip(label: string, value: string, accent?: (t: string) => string): string {
  const paint = accent ?? ansi.fg.fg;
  return ansi.fg.comment(label) + ansi.fg.comment(":") + paint(value);
}

export function joinChips(parts: Array<string | null | undefined>, sep = " · "): string {
  return parts.filter((p): p is string => !!p && p.length > 0).join(ansi.fg.comment(sep));
}

export function mutedRule(width: number): string {
  const n = Math.max(0, width);
  return ansi.fg.comment("─".repeat(n));
}

/**
 * Two-tone status line: left flush, right flush, truncated to width.
 * Uses a single ─ gutter when both sides fit with a gap.
 */
export function formatTwoToneStatus(
  left: string,
  right: string,
  width: number,
): string {
  const w = Math.max(1, width);
  if (!right) return truncateToWidth(left, w);
  if (!left) {
    const r = truncateToWidth(right, w);
    const pad = Math.max(0, w - visibleWidth(r));
    return " ".repeat(pad) + r;
  }
  const gapMin = 2;
  const leftMax = Math.max(1, Math.floor(w * 0.55));
  let L = truncateToWidth(left, leftMax);
  let R = truncateToWidth(right, Math.max(1, w - visibleWidth(L) - gapMin));
  const used = visibleWidth(L) + visibleWidth(R);
  if (used + gapMin > w) {
    L = truncateToWidth(left, Math.max(1, w - visibleWidth(R) - gapMin));
  }
  const gap = Math.max(gapMin, w - visibleWidth(L) - visibleWidth(R));
  const mid =
    gap >= 3
      ? " " + ansi.fg.comment("─".repeat(Math.max(1, gap - 2))) + " "
      : " ".repeat(gap);
  return L + mid + R;
}

// ── Role labels (Pi-like) ───────────────────────────────────────────

export function labelYou(): string {
  return ansi.fg.pink("❯") + " " + ansi.fg.cyan(ansi.bold("you"));
}

export function labelAgent(): string {
  return ansi.fg.green("✦") + " " + ansi.fg.green(ansi.bold("agent"));
}

export function styleUser(text: string): string {
  return labelYou() + "\n" + text;
}

export function styleAgentPlain(text: string): string {
  return labelAgent() + "\n" + text;
}

export function styleSystem(text: string): string {
  return ansi.dim(ansi.fg.comment(text));
}

export function styleError(text: string): string {
  return ansi.fg.red(ansi.bold("error")) + ansi.fg.comment(" · ") + text;
}

export function styleOk(text: string): string {
  return ansi.fg.green("ok") + ansi.fg.comment(" · ") + text;
}

export type ToolBlockOptions = {
  /** Total block width hint (content truncated to fit). */
  width?: number;
  /** Explicit status override: running | completed | failed | … */
  status?: string | null;
};

/**
 * Codex-like bordered tool block:
 *   ╭─ ⚙ tool · Bash ─────────
 *   │ ls -la
 *   ╰─────────────────────────
 *
 * `text` may be multi-line: first line is "Name [status]…" title material;
 * remaining lines are the body (command / args preview).
 */
export function styleToolBlock(text: string, opts: ToolBlockOptions = {}): string {
  const width = Math.max(24, opts.width ?? 56);
  const parts = text.split("\n");
  const headerRaw = parts[0] ?? "tool";
  const bodyLines = parts.slice(1).filter((l) => l.length > 0);

  // Parse "name [status] — error" from summarizeTool / stream.
  const statusMatch = headerRaw.match(/^(.*?)\s*\[([^\]]+)\]\s*(?:—\s*(.*))?$/);
  let name = headerRaw.trim();
  let status = opts.status ?? null;
  let errorTail: string | null = null;
  if (statusMatch) {
    name = statusMatch[1].trim() || "tool";
    status = statusMatch[2].trim();
    errorTail = statusMatch[3]?.trim() || null;
  }

  const displayName = name.length ? name : "tool";
  const failed =
    status === "failed" ||
    status === "error" ||
    status === "errored";
  const ok =
    status === "completed" ||
    status === "success" ||
    status === "succeeded" ||
    status === "done";

  const accent = failed ? ansi.fg.red : ok ? ansi.fg.green : ansi.fg.orange;
  const border = ansi.fg.comment;

  const titleCore =
    accent("⚙ tool") +
    ansi.fg.comment(" · ") +
    accent(ansi.bold(displayName)) +
    (status ? ansi.fg.comment(" · ") + ansi.fg.comment(status) : "");

  // ╭─ title ─────
  const leftCap = border("╭─ ");
  const titleWidth = visibleWidth(titleCore);
  const fill = Math.max(1, width - visibleWidth(leftCap) - titleWidth - 1);
  const top = leftCap + titleCore + " " + border("─".repeat(fill));

  const rows: string[] = [top];

  const contentLines =
    bodyLines.length > 0
      ? bodyLines
      : errorTail
        ? [errorTail]
        : [];

  if (contentLines.length === 0) {
    rows.push(
      border("│ ") + ansi.fg.comment(truncateToWidth("(no preview)", width - 2)),
    );
  } else {
    for (const line of contentLines) {
      const prefix = border("│ ");
      const max = Math.max(8, width - visibleWidth(prefix));
      rows.push(prefix + ansi.fg.fg(truncateToWidth(line, max)));
    }
  }

  if (errorTail && bodyLines.length > 0) {
    const prefix = border("│ ");
    const max = Math.max(8, width - visibleWidth(prefix));
    rows.push(prefix + ansi.fg.red(truncateToWidth(errorTail, max)));
  }

  const bottomAccent = failed ? ansi.fg.red : ok ? ansi.fg.green : border;
  rows.push(bottomAccent("╰" + "─".repeat(Math.max(1, width - 1))));

  return rows.join("\n");
}

/** Flat one-liner kept for callers that want compact tool text. */
export function styleTool(text: string): string {
  return styleToolBlock(text);
}

export function styleToolResult(
  text: string,
  ok: boolean,
  opts: ToolBlockOptions = {},
): string {
  return styleToolBlock(
    text.includes("[")
      ? text
      : `${text.split("\n")[0]} [${ok ? "completed" : "failed"}]\n${text.split("\n").slice(1).join("\n")}`.trim(),
    { ...opts, status: ok ? "completed" : "failed" },
  );
}

export function styleReasoning(text: string): string {
  return (
    "  " +
    ansi.fg.purple(ansi.italic(ansi.dim("think"))) +
    "\n  " +
    ansi.fg.purple(ansi.italic(ansi.dim(text)))
  );
}

export function stylePermission(text: string): string {
  return ansi.fg.yellow(ansi.bold("perm")) + ansi.fg.comment(" · ") + text;
}
