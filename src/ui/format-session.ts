import { homedir } from "node:os";
import { resolve as resolvePath } from "node:path";
import type { PickerItem } from "./picker.js";

export type TabbedPickerItem<T extends string = string> = PickerItem<T> & {
  /** Tab ids this row belongs to. The synthetic "all" tab always includes every row. */
  tabs: string[];
};

export type TabSpec = {
  id: string;
  label: string;
};

export type AgentPickerSource = {
  id: string;
  title?: string | null;
  provider: string;
  model?: string | null;
  status: string;
  cwd?: string | null;
  thinkingOptionId?: string | null;
  effectiveThinkingOptionId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lastUserMessageAt?: string | null;
  requiresAttention?: boolean;
  attentionReason?: string | null;
  labels?: Record<string, string>;
  pendingPermissions?: unknown[];
};

export type ImportPickerSource = {
  providerId: string;
  providerLabel: string;
  providerHandleId: string;
  cwd: string;
  title?: string | null;
  firstPromptPreview?: string | null;
  lastPromptPreview?: string | null;
  lastActivityAt: string;
};

export function formatRelativeTime(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const sec = Math.max(0, (now - t) / 1000);
  if (sec < 45) return "just now";
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))}m ago`;
  if (sec < 86400) return `${Math.max(1, Math.round(sec / 3600))}h ago`;
  if (sec < 86400 * 10) return `${Math.max(1, Math.round(sec / 86400))}d ago`;
  return new Date(t).toLocaleDateString();
}

export function shortCwd(cwd: string | null | undefined, home = homedir()): string | null {
  if (!cwd) return null;
  if (home && (cwd === home || cwd.startsWith(`${home}/`))) {
    return `~${cwd.slice(home.length)}` || "~";
  }
  return cwd;
}

export function cwdRelated(sessionCwd: string, here: string): boolean {
  try {
    return resolvePath(sessionCwd) === resolvePath(here);
  } catch {
    return sessionCwd === here;
  }
}

function statusMark(status: string): string {
  switch (status) {
    case "running":
      return "▶";
    case "idle":
      return "●";
    case "error":
      return "✖";
    case "initializing":
      return "…";
    case "closed":
      return "■";
    default:
      return "·";
  }
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(1, max - 1)) + "…";
}

/** Collapse whitespace; empty / missing titles become null. */
export function normalizeSessionTitle(
  title: string | null | undefined,
): string | null {
  const t = title?.replace(/\s+/g, " ").trim() ?? "";
  return t.length > 0 ? t : null;
}

/** Header brand: session title, else `(untitled <id>)`, else `paseo-tui`. */
export function formatHeaderTitle(
  title: string | null | undefined,
  agentId?: string | null,
): string {
  const name = normalizeSessionTitle(title);
  if (name) return name;
  if (agentId) return `(untitled ${agentId.slice(0, 8)})`;
  return "paseo-tui";
}

/**
 * Footer / status chip: session title (clipped), short id, or `unbound`.
 */
export function formatBoundChip(
  agentId: string | null | undefined,
  title?: string | null,
  max = 24,
): string {
  if (!agentId) return "unbound";
  const name = normalizeSessionTitle(title);
  if (!name) return agentId.slice(0, 8);
  return clip(name, max);
}

/** Timeline copy: `Title (40d43296)` or short id when untitled. */
export function formatSessionRef(
  agentId: string | null | undefined,
  title?: string | null,
): string {
  const short = agentId ? agentId.slice(0, 8) : "?";
  const name = normalizeSessionTitle(title);
  return name ? `${name} (${short})` : short;
}

export function formatAgentPickerItem(
  agent: AgentPickerSource,
  now = Date.now(),
): TabbedPickerItem {
  const title = (agent.title?.trim() || "").length
    ? agent.title!.trim()
    : `(untitled ${agent.id.slice(0, 8)})`;
  const think =
    agent.effectiveThinkingOptionId || agent.thinkingOptionId || null;
  const when =
    formatRelativeTime(
      agent.lastUserMessageAt || agent.updatedAt || agent.createdAt,
      now,
    ) ?? null;
  const perms = Array.isArray(agent.pendingPermissions)
    ? agent.pendingPermissions.length
    : 0;
  const labelBits = Object.entries(agent.labels ?? {})
    .slice(0, 3)
    .map(([k, v]) => (v ? `${k}:${v}` : k));

  const desc = [
    agent.status,
    agent.model ? `${agent.provider}/${agent.model}` : agent.provider,
    think ? `think:${think}` : null,
    agent.id.slice(0, 8),
    when,
    shortCwd(agent.cwd),
    agent.requiresAttention
      ? `attention:${agent.attentionReason || "yes"}`
      : null,
    perms > 0 ? `perms:${perms}` : null,
    labelBits.length ? labelBits.join(" ") : null,
  ]
    .filter((x): x is string => !!x && x.length > 0)
    .join(" · ");

  const tabs = ["all", `status:${agent.status}`, `provider:${agent.provider}`];
  if (agent.requiresAttention || perms > 0) tabs.push("attention");

  return {
    value: agent.id,
    label: `${statusMark(agent.status)} ${title}`,
    description: desc,
    tabs,
  };
}

export function formatImportPickerItem(
  session: ImportPickerSource,
  here: string,
  now = Date.now(),
): TabbedPickerItem {
  const prompt =
    session.lastPromptPreview?.trim() ||
    session.firstPromptPreview?.trim() ||
    "";
  const titleRaw = session.title?.trim() || "";
  const title = titleRaw || (prompt ? clip(prompt, 72) : "(untitled)");
  const when = formatRelativeTime(session.lastActivityAt, now);
  const showPrompt =
    prompt.length > 0 &&
    (!titleRaw || !prompt.startsWith(titleRaw.slice(0, 24)));

  const desc = [
    session.providerLabel || session.providerId,
    when,
    shortCwd(session.cwd),
    showPrompt ? clip(prompt, 56) : null,
    session.providerHandleId.slice(0, 8),
  ]
    .filter((x): x is string => !!x && x.length > 0)
    .join(" · ");

  const tabs = ["all", `provider:${session.providerId}`];
  if (cwdRelated(session.cwd, here)) tabs.push("cwd");

  return {
    value: `${session.providerId}::${session.providerHandleId}`,
    label: title,
    description: desc,
    tabs,
  };
}

export function buildAgentTabs(items: TabbedPickerItem[]): TabSpec[] {
  const tabs: TabSpec[] = [{ id: "all", label: "All" }];
  const statuses = ["running", "idle", "initializing", "error", "closed"];
  for (const status of statuses) {
    const id = `status:${status}`;
    if (items.some((it) => it.tabs.includes(id))) {
      tabs.push({ id, label: status });
    }
  }
  if (items.some((it) => it.tabs.includes("attention"))) {
    tabs.push({ id: "attention", label: "attention" });
  }
  const providers = uniqueTabSuffix(items, "provider:");
  if (providers.length > 1) {
    for (const p of providers) {
      tabs.push({ id: `provider:${p}`, label: p });
    }
  }
  return tabs;
}

export function buildImportTabs(items: TabbedPickerItem[]): TabSpec[] {
  const tabs: TabSpec[] = [
    { id: "all", label: "All" },
    { id: "cwd", label: "This folder" },
  ];
  for (const p of uniqueTabSuffix(items, "provider:")) {
    tabs.push({ id: `provider:${p}`, label: displayProvider(p) });
  }
  return tabs;
}

function uniqueTabSuffix(items: TabbedPickerItem[], prefix: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    for (const tab of it.tabs) {
      if (!tab.startsWith(prefix)) continue;
      const suffix = tab.slice(prefix.length);
      if (!suffix || seen.has(suffix)) continue;
      seen.add(suffix);
      out.push(suffix);
    }
  }
  return out;
}

function displayProvider(id: string): string {
  if (!id) return id;
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export function itemsForTab<T extends TabbedPickerItem>(
  items: readonly T[],
  tabId: string,
): T[] {
  if (tabId === "all") return [...items];
  return items.filter((it) => it.tabs.includes(tabId));
}
