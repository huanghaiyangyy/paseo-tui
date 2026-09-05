/**
 * Format agent.lastUsage for the status footer.
 */

export type UsageLike = {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  totalCostUsd?: number;
  contextWindowMaxTokens?: number;
  contextWindowUsedTokens?: number;
} | null | undefined;

/** Compact token count: 1234 → 1.2k, 1200000 → 1.2M */
export function formatTokenCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) {
    const v = n / 1000;
    return (v >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, "")) + "k";
  }
  const v = n / 1_000_000;
  return (v >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, "")) + "M";
}

export function formatCostUsd(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

export function formatCtxPercent(used?: number, max?: number): string | null {
  if (
    used == null ||
    max == null ||
    !Number.isFinite(used) ||
    !Number.isFinite(max) ||
    max <= 0
  ) {
    return null;
  }
  const pct = Math.min(100, Math.max(0, (used / max) * 100));
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}

/**
 * Footer chip text: `↑in ↓out · $cost · ctx%` when fields exist.
 * Returns null when usage is empty / all fields missing.
 */
export function formatUsageChips(usage: UsageLike): string | null {
  if (!usage || typeof usage !== "object") return null;
  const parts: string[] = [];
  const hasIn = usage.inputTokens != null && Number.isFinite(usage.inputTokens);
  const hasOut =
    usage.outputTokens != null && Number.isFinite(usage.outputTokens);
  if (hasIn || hasOut) {
    const bits: string[] = [];
    if (hasIn) bits.push(`↑${formatTokenCount(usage.inputTokens!)}`);
    if (hasOut) bits.push(`↓${formatTokenCount(usage.outputTokens!)}`);
    parts.push(bits.join(" "));
  }
  if (usage.totalCostUsd != null && Number.isFinite(usage.totalCostUsd)) {
    parts.push(formatCostUsd(usage.totalCostUsd));
  }
  const ctx = formatCtxPercent(
    usage.contextWindowUsedTokens,
    usage.contextWindowMaxTokens,
  );
  if (ctx) parts.push(`ctx ${ctx}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Read usage from a Paseo agent handle / snapshot-like object. */
export function readAgentUsage(agent: {
  lastUsage?: UsageLike;
  current?: () => { lastUsage?: UsageLike } | null;
} | null | undefined): UsageLike {
  if (!agent) return null;
  const direct = agent.lastUsage;
  if (direct) return direct;
  try {
    return agent.current?.()?.lastUsage ?? null;
  } catch {
    return null;
  }
}
