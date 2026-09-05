import type { CommandContext, SlashCommandDef } from "./types.js";
import { createAgent, listAgents, bindExistingAgent } from "../client/paseo.js";
import { showSelectList, type PickerItem } from "../ui/picker.js";
import {
  attachAgent,
  clearAgentBinding,
  refreshPendingPermissions,
  takePendingPermission,
} from "../session/attach.js";
import { formatPermissionBrief } from "../session/stream.js";

function splitArgs(args: string): string {
  return args.trim();
}

function providerModelLabel(provider: string, modelId: string): string {
  return `${provider}/${modelId}`;
}

async function collectReadyModelItems(
  ctx: CommandContext,
  providerFilter?: string,
): Promise<
  Array<
    PickerItem & {
      thinkingOptions?: Array<{
        id: string;
        label: string;
        description?: string;
      }>;
    }
  >
> {
  const client = await ctx.ensureClient();
  ctx.timeline.appendSystem("Waiting for provider discovery…");
  const snap = await client.providers.waitForReady({
    cwd: process.cwd(),
    timeoutMs: 20_000,
  });
  const items: Array<
    PickerItem & {
      thinkingOptions?: Array<{
        id: string;
        label: string;
        description?: string;
      }>;
    }
  > = [];
  for (const entry of snap.entries ?? []) {
    if (entry.enabled === false) continue;
    if (entry.status !== "ready") continue;
    if (providerFilter && entry.provider !== providerFilter) continue;
    for (const model of entry.models ?? []) {
      if (model.isSelectable === false) continue;
      const value = providerModelLabel(entry.provider, model.id);
      items.push({
        value,
        label: value,
        description:
          model.description ??
          model.label ??
          (entry.label ? `${entry.label}` : undefined),
        thinkingOptions: model.thinkingOptions?.map((o) => ({
          id: o.id,
          label: o.label,
          description: o.description,
        })),
      });
    }
  }
  return items;
}

async function pickProviderModel(
  ctx: CommandContext,
  providerFilter?: string,
): Promise<string | null> {
  const items = await collectReadyModelItems(ctx, providerFilter);
  if (items.length === 0) {
    ctx.timeline.appendSystem(
      providerFilter
        ? `No ready models for provider "${providerFilter}".`
        : "No ready provider/models found. Check daemon provider config.",
    );
    return null;
  }
  ctx.timeline.appendSystem("Select a provider/model (Esc to cancel)…");
  ctx.timeline.requestRender();
  const chosen = await showSelectList(ctx.tui, items);
  if (!chosen) {
    ctx.timeline.appendSystem("Cancelled.");
  }
  return chosen;
}

async function collectThinkingOptions(
  ctx: CommandContext,
): Promise<PickerItem[]> {
  const items: PickerItem[] = [];
  const seen = new Set<string>();

  const snap = ctx.state.agent?.current();
  const features = snap?.features ?? ctx.state.agent?.features ?? null;
  if (Array.isArray(features)) {
    for (const feature of features) {
      if (
        feature &&
        typeof feature === "object" &&
        "type" in feature &&
        feature.type === "select" &&
        typeof feature.id === "string" &&
        /think/i.test(feature.id)
      ) {
        for (const opt of feature.options ?? []) {
          if (seen.has(opt.id)) continue;
          seen.add(opt.id);
          items.push({
            value: opt.id,
            label: opt.label || opt.id,
            description: opt.description,
          });
        }
      }
    }
  }

  const modelKey = ctx.state.model ?? ctx.state.defaultProvider;
  const { provider } = splitProviderModel(modelKey);
  try {
    const catalog = await collectReadyModelItems(ctx, provider || undefined);
    for (const entry of catalog) {
      if (entry.value !== modelKey && !entry.value.endsWith(`/${modelKey}`)) {
        // Prefer exact model match; also accept when modelKey is provider/model
        if (modelKey.includes("/") && entry.value !== modelKey) continue;
      }
      for (const opt of entry.thinkingOptions ?? []) {
        if (seen.has(opt.id)) continue;
        seen.add(opt.id);
        items.push({
          value: opt.id,
          label: opt.label || opt.id,
          description: opt.description,
        });
      }
    }
    // If exact match yielded nothing, take union of all thinking options for provider
    if (items.length === 0) {
      for (const entry of catalog) {
        for (const opt of entry.thinkingOptions ?? []) {
          if (seen.has(opt.id)) continue;
          seen.add(opt.id);
          items.push({
            value: opt.id,
            label: opt.label || opt.id,
            description: opt.description,
          });
        }
      }
    }
  } catch {
    // catalog best-effort
  }

  return items;
}

async function applyThinkLevel(
  ctx: CommandContext,
  level: string,
): Promise<void> {
  ctx.state.thinkLevel = level;
  ctx.setStatus(ctx.statusLine());

  if (ctx.state.agentId && ctx.state.daemon) {
    try {
      const notice = await ctx.state.daemon.setAgentThinkingOption(
        ctx.state.agentId,
        level,
      );
      if (notice?.message) {
        ctx.timeline.appendSystem(
          `Think set on live agent: ${level} (${notice.message})`,
        );
      } else {
        ctx.timeline.appendSystem(`Think set on live agent: ${level}`);
      }
      try {
        await ctx.state.agent?.refresh();
      } catch {
        // refresh best-effort
      }
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.timeline.appendSystem(
        `Local think level set to ${level}. Live setAgentThinkingOption failed: ${message}`,
      );
      return;
    }
  }

  ctx.timeline.appendSystem(
    `Local think level set to ${level}. Will pass thinkingOptionId on next /new when possible.`,
  );
}

async function createAndBind(
  ctx: CommandContext,
  provider: string,
): Promise<void> {
  const client = await ctx.ensureClient();
  const thinkingOptionId = ctx.state.thinkLevel ?? undefined;
  ctx.timeline.appendSystem(
    `Creating agent with provider ${provider}` +
      (thinkingOptionId ? ` think=${thinkingOptionId}` : "") +
      "…",
  );
  const agent = await createAgent(client, {
    provider,
    cwd: process.cwd(),
    title: "paseo-tui",
    thinkingOptionId,
  });
  await attachAgent(ctx, agent);
  ctx.timeline.appendSystem(`Created and bound agent ${agent.id}`);
}

async function pickAndBindAgent(ctx: CommandContext): Promise<void> {
  const client = await ctx.ensureClient();
  const page = await listAgents(client);
  if (page.entries.length === 0) {
    ctx.timeline.appendSystem("No agents found. Use /new to create one.");
    return;
  }
  const items: PickerItem[] = page.entries.map((entry) => {
    const a = entry.agent;
    const title = a.title ? ` "${a.title}"` : "";
    return {
      value: a.id,
      label: `${a.id.slice(0, 12)}… [${a.status}] ${a.provider}${a.model ? "/" + a.model : ""}${title}`,
      description: a.cwd,
    };
  });
  ctx.timeline.appendSystem("Select an agent to bind (Esc to cancel)…");
  ctx.timeline.requestRender();
  const chosen = await showSelectList(ctx.tui, items);
  if (!chosen) {
    ctx.timeline.appendSystem("Cancelled.");
    return;
  }
  await ctx.bindAgent(chosen);
  ctx.timeline.appendSystem(`Bound to agent ${chosen}`);
}

const helpCommand: SlashCommandDef = {
  name: "help",
  description: "List available slash commands",
  async run(ctx) {
    const lines = COMMANDS.map((c) => {
      const hint = c.argumentHint ? ` ${c.argumentHint}` : "";
      return `/${c.name}${hint}  —  ${c.description}`;
    });
    ctx.timeline.appendSystem("Commands:\n" + lines.join("\n"));
  },
};

const bindCommand: SlashCommandDef = {
  name: "bind",
  description: "SelectList of agents, or bind by id",
  argumentHint: "[id]",
  async run(ctx, args) {
    const id = splitArgs(args);
    if (id) {
      await ctx.bindAgent(id);
      ctx.timeline.appendSystem(`Bound to agent ${id}`);
      return;
    }
    await pickAndBindAgent(ctx);
  },
};

const switchCommand: SlashCommandDef = {
  name: "switch",
  description: "Unbind current and bind another agent (picker)",
  argumentHint: "[id]",
  async run(ctx, args) {
    const id = splitArgs(args);
    if (id) {
      await ctx.bindAgent(id);
      ctx.timeline.appendSystem(`Switched to agent ${id}`);
      return;
    }
    await pickAndBindAgent(ctx);
  },
};

const newCommand: SlashCommandDef = {
  name: "new",
  description: "Create a new agent; opens model picker when no arg",
  argumentHint: "[provider/model]",
  async run(ctx, args) {
    const arg = splitArgs(args);
    if (arg) {
      await createAndBind(ctx, arg);
      return;
    }
    const chosen = await pickProviderModel(ctx);
    if (!chosen) return;
    await createAndBind(ctx, chosen);
  },
};

const importCommand: SlashCommandDef = {
  name: "import",
  description: "Import a recent provider session for this cwd",
  async run(ctx) {
    const daemon = await ctx.ensureDaemon();
    const client = await ctx.ensureClient();
    ctx.timeline.appendSystem("Fetching recent provider sessions…");
    const payload = await daemon.fetchRecentProviderSessions({
      cwd: process.cwd(),
      limit: 50,
    });
    const entries = payload.entries ?? [];
    if (entries.length === 0) {
      const filtered = payload.filteredAlreadyImportedCount;
      const extra =
        typeof filtered === "number" && filtered > 0
          ? ` (${filtered} already imported filtered out)`
          : "";
      ctx.timeline.appendSystem(
        `No external provider sessions found for this cwd${extra}.\n` +
          "Providers may not expose recent sessions, or none exist yet.",
      );
      return;
    }

    const items: PickerItem[] = entries.map((entry, index) => {
      const title =
        entry.title?.trim() ||
        entry.lastPromptPreview?.trim() ||
        entry.firstPromptPreview?.trim() ||
        "(untitled)";
      const when = entry.lastActivityAt
        ? new Date(entry.lastActivityAt).toLocaleString()
        : "";
      return {
        value: String(index),
        label: `${entry.providerLabel || entry.providerId}: ${title.slice(0, 60)}`,
        description: [entry.cwd, when].filter(Boolean).join(" · "),
      };
    });

    ctx.timeline.appendSystem("Select a session to import (Esc to cancel)…");
    ctx.timeline.requestRender();
    const chosen = await showSelectList(ctx.tui, items);
    if (chosen == null) {
      ctx.timeline.appendSystem("Import cancelled.");
      return;
    }
    const entry = entries[Number.parseInt(chosen, 10)];
    if (!entry) {
      ctx.timeline.appendError("Invalid selection.");
      return;
    }

    ctx.timeline.appendSystem(
      `Importing ${entry.providerLabel || entry.providerId} session…`,
    );
    const imported = await daemon.importAgent({
      providerId: entry.providerId,
      providerHandleId: entry.providerHandleId,
      cwd: entry.cwd || process.cwd(),
    });
    const agentId = imported.id;
    if (!agentId) {
      ctx.timeline.appendError("Import succeeded but no agent id returned.");
      return;
    }
    const agent = client.agents.ref(agentId);
    await agent.refresh();
    await attachAgent(ctx, agent);
    ctx.timeline.appendSystem(`Imported and bound agent ${agent.id}`);
  },
};

function splitProviderModel(value: string): { provider: string; model: string } {
  const slash = value.indexOf("/");
  if (slash === -1) return { provider: value, model: value };
  return {
    provider: value.slice(0, slash),
    model: value.slice(slash + 1),
  };
}

async function applyModelToLiveAgent(
  ctx: CommandContext,
  fullOrShort: string,
): Promise<void> {
  const daemon = await ctx.ensureDaemon();
  const agentId = ctx.state.agentId;
  if (!agentId || !ctx.state.agent) {
    ctx.state.model = fullOrShort;
    ctx.setStatus(ctx.statusLine());
    ctx.timeline.appendSystem(
      `Local model set to ${fullOrShort} (no live agent bound).`,
    );
    return;
  }

  const { provider, model } = splitProviderModel(fullOrShort);
  const candidates = fullOrShort.includes("/")
    ? [model, fullOrShort]
    : [fullOrShort];

  let lastError: unknown;
  let applied: string | null = null;
  for (const candidate of candidates) {
    try {
      await daemon.setAgentModel(agentId, candidate);
      applied = candidate;
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!applied) {
    throw lastError instanceof Error
      ? lastError
      : new Error(String(lastError ?? "setAgentModel failed"));
  }

  await ctx.state.agent.refresh();
  const snap = ctx.state.agent.current();
  if (snap?.model) {
    ctx.state.model = `${snap.provider}/${snap.model}`;
  } else {
    ctx.state.model = fullOrShort.includes("/")
      ? fullOrShort
      : `${provider}/${applied}`;
  }
  ctx.setStatus(ctx.statusLine());
  ctx.timeline.appendSystem(
    `Live agent model set to ${ctx.state.model} (via setAgentModel ${applied}).`,
  );
}

const modelCommand: SlashCommandDef = {
  name: "model",
  description: "Show/set model; applies to live agent when bound",
  argumentHint: "[provider/model|model]",
  async run(ctx, args) {
    const id = splitArgs(args);
    if (!id) {
      ctx.timeline.appendSystem(
        `Current model: ${ctx.state.model ?? "(unset)"}` +
          (ctx.state.agentId ? " (bound)" : " (local)"),
      );
      if (!ctx.state.agentId) {
        ctx.timeline.appendSystem("Bind an agent or pass /model <id> to set.");
        return;
      }
      const current = ctx.state.model ?? "";
      const { provider } = splitProviderModel(
        current || ctx.state.defaultProvider,
      );
      const chosen = await pickProviderModel(ctx, provider || undefined);
      if (!chosen) return;
      await applyModelToLiveAgent(ctx, chosen);
      return;
    }
    await applyModelToLiveAgent(ctx, id);
  },
};

const thinkCommand: SlashCommandDef = {
  name: "think",
  description: "Set reasoning effort; picker when bound and no args",
  argumentHint: "[level]",
  async run(ctx, args) {
    const level = splitArgs(args);
    if (!level) {
      ctx.timeline.appendSystem(
        `Think level: ${ctx.state.thinkLevel ?? "(unset)"}`,
      );
      if (!ctx.state.agentId) {
        ctx.timeline.appendSystem(
          "Pass /think <level>, or bind an agent to pick from catalog.",
        );
        return;
      }
      const options = await collectThinkingOptions(ctx);
      if (options.length === 0) {
        ctx.timeline.appendSystem(
          "No thinkingOptions found on catalog/agent features. Pass /think <level> manually.",
        );
        return;
      }
      ctx.timeline.appendSystem("Select thinking option (Esc to cancel)…");
      ctx.timeline.requestRender();
      const chosen = await showSelectList(ctx.tui, options);
      if (!chosen) {
        ctx.timeline.appendSystem("Cancelled.");
        return;
      }
      await applyThinkLevel(ctx, chosen);
      return;
    }
    await applyThinkLevel(ctx, level);
  },
};

async function respondPermission(
  ctx: CommandContext,
  behavior: "allow" | "deny",
  args: string,
): Promise<void> {
  const daemon = await ctx.ensureDaemon();
  if (!ctx.state.agentId) {
    ctx.timeline.appendSystem("No agent bound.");
    return;
  }

  let pending = ctx.state.pendingPermissions;
  if (pending.length === 0) {
    pending = await refreshPendingPermissions(ctx);
  }
  if (pending.length === 0) {
    ctx.timeline.appendSystem("No pending permissions.");
    return;
  }

  const parts = splitArgs(args).split(/\s+/).filter(Boolean);
  let requestId: string | undefined;
  let actionId: string | undefined;

  if (parts.length >= 1) {
    const maybeId = parts[0]!;
    if (pending.some((p) => p.id === maybeId)) {
      requestId = maybeId;
      actionId = parts[1];
    } else if (pending.length === 1) {
      actionId = maybeId;
    } else {
      // Could be action id or request id — try picker
      requestId = undefined;
      actionId = maybeId;
    }
  }

  let req = takePendingPermission(ctx, requestId);
  if (!req && pending.length > 1 && !requestId) {
    const items: PickerItem[] = pending.map((p) => ({
      value: p.id,
      label: `${p.title || p.name} (${p.kind})`,
      description: p.id,
    }));
    ctx.timeline.appendSystem(`Select permission to ${behavior}…`);
    ctx.timeline.requestRender();
    const chosen = await showSelectList(ctx.tui, items);
    if (!chosen) {
      ctx.timeline.appendSystem("Cancelled.");
      return;
    }
    req = takePendingPermission(ctx, chosen);
  }
  if (!req) {
    ctx.timeline.appendError("Could not resolve pending permission request.");
    return;
  }

  let selectedActionId = actionId;
  if (!selectedActionId && req.actions && req.actions.length > 0) {
    const matching = req.actions.filter((a) => a.behavior === behavior);
    if (matching.length === 1) {
      selectedActionId = matching[0]!.id;
    } else if (matching.length > 1) {
      const items: PickerItem[] = matching.map((a) => ({
        value: a.id,
        label: a.label || a.id,
        description: a.behavior,
      }));
      const chosen = await showSelectList(ctx.tui, items);
      if (!chosen) {
        ctx.timeline.appendSystem("Cancelled.");
        // put back
        ctx.state.pendingPermissions.unshift(req);
        return;
      }
      selectedActionId = chosen;
    }
  }

  const response =
    behavior === "allow"
      ? {
          behavior: "allow" as const,
          ...(selectedActionId ? { selectedActionId } : {}),
        }
      : {
          behavior: "deny" as const,
          ...(selectedActionId ? { selectedActionId } : {}),
          interrupt: true,
        };

  try {
    await daemon.respondToPermission(ctx.state.agentId, req.id, response);
    ctx.timeline.appendSystem(
      `Permission ${req.id} → ${behavior}` +
        (selectedActionId ? ` (${selectedActionId})` : ""),
    );
    ctx.state.seenPermissionIds.delete(req.id);
  } catch (err) {
    ctx.state.pendingPermissions.unshift(req);
    throw err;
  }
  ctx.setStatus(ctx.statusLine());
}

const allowCommand: SlashCommandDef = {
  name: "allow",
  description: "Allow a pending agent permission (via respondToPermission)",
  argumentHint: "[requestId|actionId]",
  async run(ctx, args) {
    await respondPermission(ctx, "allow", args);
  },
};

const denyCommand: SlashCommandDef = {
  name: "deny",
  description: "Deny a pending agent permission (via respondToPermission)",
  argumentHint: "[requestId|actionId]",
  async run(ctx, args) {
    await respondPermission(ctx, "deny", args);
  },
};

const permsCommand: SlashCommandDef = {
  name: "perms",
  description: "List pending permissions (refresh from agent)",
  async run(ctx) {
    if (!ctx.state.agentId) {
      ctx.timeline.appendSystem("No agent bound.");
      return;
    }
    const pending = await refreshPendingPermissions(ctx);
    if (pending.length === 0) {
      ctx.timeline.appendSystem("No pending permissions.");
      return;
    }
    for (const req of pending) {
      ctx.timeline.appendSystem(formatPermissionBrief(req));
    }
  },
};

const cwdCommand: SlashCommandDef = {
  name: "cwd",
  description: "Show current working directory",
  async run(ctx) {
    const agentCwd = ctx.state.agent?.cwd;
    ctx.timeline.appendSystem(
      `process cwd: ${process.cwd()}` +
        (agentCwd ? `\nagent cwd: ${agentCwd}` : ""),
    );
  },
};

const detachCommand: SlashCommandDef = {
  name: "detach",
  description: "Unbind the current agent without archiving",
  async run(ctx) {
    if (!ctx.state.agent) {
      ctx.timeline.appendSystem("Not bound to an agent.");
      return;
    }
    const id = ctx.state.agentId;
    try {
      await ctx.state.agent.detach();
    } catch {
      // Local unbind still proceeds if daemon detach fails / is unavailable.
    }
    ctx.unbindAgent();
    ctx.timeline.appendSystem(`Detached from agent ${id ?? "(unknown)"}`);
  },
};

const quitCommand: SlashCommandDef = {
  name: "quit",
  description: "Stop the TUI and exit",
  async run(ctx) {
    ctx.timeline.appendSystem("Bye.");
    ctx.stop();
  },
};


const expandCommand: SlashCommandDef = {
  name: "expand",
  description: "Expand the last collapsed tool block",
  run(ctx) {
    const ok = ctx.timeline.expandLastTool?.() ?? false;
    if (ok) {
      ctx.timeline.appendSystem("Expanded last tool block.");
    } else {
      ctx.timeline.appendSystem("No collapsed tool to expand. (Long tools auto-collapse; /collapse to fold.)");
    }
  },
};

const collapseCommand: SlashCommandDef = {
  name: "collapse",
  description: "Collapse the last expanded tool block",
  run(ctx) {
    const ok = ctx.timeline.collapseLastTool?.() ?? false;
    if (ok) {
      ctx.timeline.appendSystem("Collapsed last tool block.");
    } else {
      ctx.timeline.appendSystem("No expanded tool to collapse.");
    }
  },
};

const thinkExpandCommand: SlashCommandDef = {
  name: "think-expand",
  description: "Expand the last collapsed think/reasoning block",
  run(ctx) {
    const ok = ctx.timeline.expandLastThink?.() ?? false;
    if (ok) {
      ctx.timeline.appendSystem("Expanded last think block.");
    } else {
      ctx.timeline.appendSystem("No collapsed think block. Short thinks stay open; long ones collapse.");
    }
  },
};

const thinkingCommand: SlashCommandDef = {
  name: "thinking",
  description: "Toggle expand/collapse on the last think block",
  run(ctx) {
    if (ctx.timeline.hasCollapsedThinks?.()) {
      const ok = ctx.timeline.expandLastThink?.() ?? false;
      ctx.timeline.appendSystem(ok ? "Expanded last think block." : "Nothing to expand.");
      return;
    }
    const ok = ctx.timeline.collapseLastThink?.() ?? false;
    ctx.timeline.appendSystem(ok ? "Collapsed last think block." : "No think block to toggle.");
  },
};

export const COMMANDS: SlashCommandDef[] = [
  helpCommand,
  bindCommand,
  switchCommand,
  newCommand,
  importCommand,
  modelCommand,
  thinkCommand,
  thinkingCommand,
  thinkExpandCommand,
  expandCommand,
  collapseCommand,
  allowCommand,
  denyCommand,
  permsCommand,
  cwdCommand,
  detachCommand,
  quitCommand,
];

export const COMMAND_BY_NAME = new Map(
  COMMANDS.map((c) => [c.name.toLowerCase(), c]),
);

export function autocompleteCommands(): { name: string; description: string }[] {
  return COMMANDS.map((c) => ({
    name: c.name,
    description: c.description,
  }));
}

export async function dispatchSlash(
  ctx: CommandContext,
  line: string,
): Promise<boolean> {
  const trimmed = line.trim();
  if (!trimmed.startsWith("/")) return false;
  const body = trimmed.slice(1);
  const space = body.search(/\s/);
  const name = (space === -1 ? body : body.slice(0, space)).toLowerCase();
  const args = space === -1 ? "" : body.slice(space + 1);
  const cmd = COMMAND_BY_NAME.get(name);
  if (!cmd) {
    ctx.timeline.appendError(`Unknown command /${name}. Try /help.`);
    return true;
  }
  try {
    await cmd.run(ctx, args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.timeline.appendError(`/${name} failed: ${message}`);
  }
  return true;
}

export function statusLine(ctx: CommandContext): string {
  const conn = ctx.state.connectionLabel
    ? `conn:${ctx.state.connectionLabel}`
    : "conn:?";
  const bound = ctx.state.agentId
    ? `bound:${ctx.state.agentId.slice(0, 8)}`
    : "unbound";
  const model = ctx.state.model ? ` model:${ctx.state.model}` : "";
  const think = ctx.state.thinkLevel ? ` think:${ctx.state.thinkLevel}` : "";
  const perms =
    ctx.state.pendingPermissions.length > 0
      ? ` perms:${ctx.state.pendingPermissions.length}`
      : "";
  return `${conn} · ${bound}${model}${think}${perms}`;
}

export async function bindById(ctx: CommandContext, id: string): Promise<void> {
  const client = await ctx.ensureClient();
  const agent = await bindExistingAgent(client, id);
  await attachAgent(ctx, agent);
}

export { clearAgentBinding };
