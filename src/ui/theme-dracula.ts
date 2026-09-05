/**
 * Dracula Transparent theme helpers.
 * Uses ANSI SGR only — no opaque full-screen backgrounds so Ghostty
 * background-opacity / blur can show through.
 */

import type { MarkdownTheme } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

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

/** Dracula MarkdownTheme for agent replies (no opaque backgrounds). */
export const markdownTheme: MarkdownTheme = {
  heading: (text) => ansi.fg.purple(ansi.bold(text)),
  link: (text) => ansi.fg.cyan(text),
  linkUrl: (text) => ansi.fg.comment(text),
  code: (text) => ansi.fg.pink(text),
  codeBlock: (text) => ansi.fg.fg(text),
  codeBlockBorder: (text) => ansi.fg.comment(text),
  quote: (text) => ansi.fg.comment(ansi.italic(text)),
  quoteBorder: (text) => ansi.fg.purple(text),
  hr: (text) => ansi.fg.comment(text),
  listBullet: (text) => ansi.fg.cyan(text),
  bold: (text) => ansi.bold(text),
  italic: (text) => ansi.italic(text),
  strikethrough: (text) => `\x1b[9m${text}${RESET}`,
  underline: (text) => `\x1b[4m${text}${RESET}`,
  codeBlockIndent: "  ",
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

export function styleTool(text: string): string {
  return ansi.fg.orange("⚙ tool") + ansi.fg.comment(" · ") + ansi.fg.orange(text);
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
