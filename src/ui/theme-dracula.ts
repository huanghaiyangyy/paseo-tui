/**
 * Dracula Transparent theme helpers.
 * Uses ANSI SGR only — no opaque full-screen backgrounds so Ghostty
 * background-opacity / blur can show through.
 */

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
    selectedPrefix: ansi.fg.pink,
    selectedText: ansi.fg.fg,
    description: ansi.fg.comment,
    scrollInfo: ansi.fg.comment,
    noMatch: ansi.fg.orange,
  },
};

export function styleUser(text: string): string {
  return ansi.fg.cyan(ansi.bold("you")) + ansi.fg.comment(" › ") + text;
}

export function styleAgent(text: string): string {
  return ansi.fg.green(ansi.bold("agent")) + ansi.fg.comment(" › ") + text;
}

export function styleSystem(text: string): string {
  return ansi.fg.comment("· ") + ansi.fg.comment(text);
}

export function styleError(text: string): string {
  return ansi.fg.red("error") + ansi.fg.comment(" › ") + text;
}

export function styleOk(text: string): string {
  return ansi.fg.green("ok") + ansi.fg.comment(" › ") + text;
}
