import {
  type Component,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import {
  ansi,
  chip,
  formatTwoToneStatus,
  joinChips,
  mutedRule,
} from "./theme-dracula.js";

export type HeaderChips = {
  model?: string | null;
  think?: string | null;
  agentId?: string | null;
  conn?: string | null;
  extra?: string | null;
};

/**
 * Live header: branded title + compact chips, with a muted ─ rule.
 * Mutate via setChips / setTitle (TruncatedText has no setters).
 */
export class HeaderBar implements Component {
  private title: string;
  private chips: HeaderChips = {};
  private cachedLine = "";

  constructor(title = "paseo-tui") {
    this.title = title;
    this.rebuild();
  }

  setTitle(title: string): void {
    this.title = title;
    this.rebuild();
  }

  setChips(chips: HeaderChips): void {
    this.chips = { ...this.chips, ...chips };
    this.rebuild();
  }

  private rebuild(): void {
    const shortModel = shortModelName(this.chips.model);
    const shortId = this.chips.agentId
      ? this.chips.agentId.slice(0, 8)
      : null;
    const chipLine = joinChips([
      shortModel ? chip("model", shortModel, ansi.fg.cyan) : null,
      this.chips.think
        ? chip("think", this.chips.think, ansi.fg.purple)
        : null,
      shortId ? chip("agent", shortId, ansi.fg.green) : null,
      this.chips.conn
        ? chip("conn", this.chips.conn, connAccent(this.chips.conn))
        : null,
      this.chips.extra ? ansi.fg.yellow(this.chips.extra) : null,
    ]);
    const branded = ansi.fg.purple(ansi.bold(this.title));
    this.cachedLine =
      branded +
      (chipLine ? ansi.fg.comment(" ─ ") + chipLine : ansi.fg.comment(" ─"));
  }

  invalidate(): void {
    // line rebuilt on set*
  }

  render(width: number): string[] {
    const w = Math.max(1, width);
    const line = truncateToWidth(this.cachedLine, w);
    const rule = mutedRule(w);
    return [line, rule];
  }
}

export type StatusParts = {
  conn?: string | null;
  bound?: string | null;
  model?: string | null;
  think?: string | null;
  /** Token/cost chips: ↑in ↓out · $ · ctx% */
  usage?: string | null;
  extra?: string | null;
};

/**
 * Two-tone footer: left `conn · bound/id`, right `usage · model · think`.
 */
export class StatusFooter implements Component {
  private parts: StatusParts = {};

  constructor(initial?: StatusParts) {
    if (initial) this.parts = { ...initial };
  }

  setParts(parts: StatusParts): void {
    this.parts = { ...this.parts, ...parts };
  }

  /** Accept a legacy statusLine string and best-effort parse, or raw extra. */
  setFromStatusLine(line: string): void {
    // Prefer structured setParts from app; this keeps a fallback path.
    this.parts = { ...this.parts, extra: line.includes("running") ? "running…" : this.parts.extra };
  }

  invalidate(): void {
    // no cache
  }

  render(width: number): string[] {
    const w = Math.max(1, width);
    const conn = this.parts.conn ?? "idle";
    const bound = this.parts.bound ?? "unbound";
    const left = joinChips([
      chip("conn", conn, connAccent(conn)),
      bound === "unbound"
        ? ansi.fg.comment("unbound")
        : chip("bound", bound, ansi.fg.green),
      this.parts.extra ? ansi.fg.yellow(this.parts.extra) : null,
    ]);
    const right = joinChips([
      this.parts.usage ? ansi.fg.comment(this.parts.usage) : null,
      this.parts.model
        ? chip("model", shortModelName(this.parts.model) ?? this.parts.model, ansi.fg.cyan)
        : null,
      this.parts.think
        ? chip("think", this.parts.think, ansi.fg.purple)
        : null,
    ]);
    return [formatTwoToneStatus(left, right, w)];
  }
}

function shortModelName(model?: string | null): string | null {
  if (!model) return null;
  const slash = model.lastIndexOf("/");
  return slash >= 0 ? model.slice(slash + 1) : model;
}

function connAccent(conn: string): (t: string) => string {
  if (conn === "connected") return ansi.fg.green;
  if (conn === "reconnecting" || conn === "connecting") return ansi.fg.yellow;
  if (conn === "disconnected") return ansi.fg.red;
  return ansi.fg.comment;
}

/** @deprecated Prefer HeaderBar — kept for any stray imports. */
export function createHeader(title = "paseo-tui"): HeaderBar {
  return new HeaderBar(title);
}

/** @deprecated Prefer StatusFooter. */
export function createStatusFooter(text: string): StatusFooter {
  const footer = new StatusFooter();
  footer.setFromStatusLine(text);
  // Rough parse of legacy "conn:x · bound:y model:z"
  const conn = /conn:([^\s·]+)/.exec(text)?.[1];
  const bound = /bound:([^\s·]+)/.exec(text)?.[1];
  const unbound = /\bunbound\b/.test(text);
  const model = /model:([^\s·]+)/.exec(text)?.[1];
  const think = /think:([^\s·]+)/.exec(text)?.[1];
  footer.setParts({
    conn: conn ?? undefined,
    bound: unbound ? "unbound" : bound,
    model,
    think,
  });
  return footer;
}

