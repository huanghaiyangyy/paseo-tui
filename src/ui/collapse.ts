/**
 * Pure helpers for collapsible tool / think blocks and mid-stream fence detection.
 */

/** Auto-collapse tools whose body (preview) exceeds this many lines. */
export const TOOL_COLLAPSE_BODY_LINES = 2;

/** Auto-expand think blocks shorter than this; collapse longer ones. */
export const THINK_EXPAND_MAX_CHARS = 120;

/** Preview length for collapsed think one-liner. */
export const THINK_PREVIEW_CHARS = 60;

export type ToolCollapseParts = {
  name: string;
  status: string | null;
  bodyLines: string[];
  errorTail: string | null;
};

/** Parse stream/tool header+body text into display parts. */
export function parseToolText(text: string): ToolCollapseParts {
  const parts = text.split("\n");
  const headerRaw = parts[0] ?? "tool";
  const bodyLines = parts.slice(1).filter((l) => l.length > 0);
  const statusMatch = headerRaw.match(/^(.*?)\s*\[([^\]]+)\]\s*(?:—\s*(.*))?$/);
  let name = headerRaw.trim();
  let status: string | null = null;
  let errorTail: string | null = null;
  if (statusMatch) {
    name = statusMatch[1].trim() || "tool";
    status = statusMatch[2].trim();
    errorTail = statusMatch[3]?.trim() || null;
  }
  return {
    name: name.length ? name : "tool",
    status,
    bodyLines,
    errorTail,
  };
}

/** True when tool body is long enough to start collapsed. */
export function shouldAutoCollapseTool(text: string): boolean {
  const { bodyLines } = parseToolText(text);
  return bodyLines.length > TOOL_COLLAPSE_BODY_LINES;
}

/** One-line collapsed tool summary (no ANSI — caller paints). */
export function formatCollapsedToolSummary(text: string): string {
  const { name, status, bodyLines, errorTail } = parseToolText(text);
  const preview =
    bodyLines[0]?.replace(/\s+/g, " ").trim() ||
    errorTail?.replace(/\s+/g, " ").trim() ||
    "";
  const n = bodyLines.length;
  const bits = [`tool · ${name}`];
  if (status) bits.push(status);
  if (preview) {
    const short =
      preview.length > 48 ? preview.slice(0, 45) + "…" : preview;
    bits.push(short);
  }
  if (n > 1) bits.push(`(${n} lines)`);
  bits.push("/expand");
  return bits.join(" · ");
}

/** True when think text should start collapsed. */
export function shouldAutoCollapseThink(text: string): boolean {
  return text.trim().length >= THINK_EXPAND_MAX_CHARS;
}

/** One-line collapsed think summary (no ANSI). */
export function formatCollapsedThinkSummary(text: string): string {
  const raw = text.replace(/\s+/g, " ").trim();
  const n = raw.length;
  if (n === 0) return `think · (empty) · /think-expand`;
  const preview =
    raw.length > THINK_PREVIEW_CHARS
      ? raw.slice(0, THINK_PREVIEW_CHARS - 1) + "…"
      : raw;
  return `think · ${preview} · (${n} chars) · /think-expand`;
}

/**
 * Count markdown fence openers (lines whose first non-space chars are ```).
 * Even + >=2 ⇒ at least one complete fenced block.
 */
export function countFenceMarkers(text: string): number {
  let n = 0;
  for (const line of text.split("\n")) {
    if (/^\s*```/.test(line)) n += 1;
  }
  return n;
}

/** True when fenced blocks look balanced/complete (safe to promote to Markdown). */
export function hasCompleteFenceBlocks(text: string): boolean {
  const n = countFenceMarkers(text);
  return n >= 2 && n % 2 === 0;
}
