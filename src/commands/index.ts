import type { CommandContext, SlashCommandDef } from "./types.js";
import { createAgent, listAgents, bindExistingAgent } from "../client/paseo.js";
import { showSelectList, type PickerItem } from "../ui/picker.js";

function splitArgs(args: string): string {
  return args.trim();
}

function providerModelLabel(provider: string, modelId: string): string {
  return `${provider}/${modelId}`;
}

async function collectReadyModelItems(
  ctx: CommandContext,
  providerFilter?: string,
): Promise<PickerItem[]> {
  const client = await ctx.ensureClient();
  ctx.timeline.appendSystem("Waiting for provider discovery…");
  const snap = await client.providers.waitForReady({
    cwd: process.cwd(),
    timeoutMs: 20_000,
  });
  const items: PickerItem[] = [];
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

async function createAndBind(
  ctx: CommandContext,
  provider: string,
): Promise<void> {
  const client = await ctx.ensureClient();
  const thinkingOptionId = ctx.state.thinkLevel ?? undefined;
  ctx.timeline.appendSystem(`Creating agent with provider ${provider}…`);
  const agent = await createAgent(client, {
    provider,
    cwd: process.cwd(),
    title: "paseo-tui",
    thinkingOptionId,
  });
  ctx.state.agent = agent;
  ctx.state.agentId = agent.id;
  ctx.state.model = provider;
  const snap = agent.current();
  if (snap?.model) ctx.state.model = `${snap.provider}/${snap.model}`;
  ctx.setStatus(statusLine(ctx));
  ctx.timeline.appendSystem(`Created and bound agent ${agent.id}`);
  agent.subscribe((update) => {
    const msg = summarizeAgentUpdate(update);
    if (msg) ctx.timeline.appendAgent(msg);
  });
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
  description: "List agents and bind one, or bind by id",
  argumentHint: "[id]",
  async run(ctx, args) {
    const id = splitArgs(args);
    const client = await ctx.ensureClient();
    if (id) {
      await ctx.bindAgent(id);
      ctx.timeline.appendSystem(`Bound to agent ${id}`);
      return;
    }
    const page = await listAgents(client);
    if (page.entries.length === 0) {
      ctx.timeline.appendSystem("No agents found. Use /new to create one.");
      return;
    }
    const lines = page.entries.map((entry) => {
      const a = entry.agent;
      const title = a.title ? ` "${a.title}"` : "";
      return `  ${a.id}  [${a.status}]  ${a.provider}${a.model ? "/" + a.model : ""}${title}`;
    });
    ctx.timeline.appendSystem(
      "Agents (pass an id: /bind <id>):\n" + lines.join("\n"),
    );
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
      const title = entry.title?.trim() || entry.lastPromptPreview?.trim() || entry.firstPromptPreview?.trim() || "(untitled)";
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
    ctx.state.agent = agent;
    ctx.state.agentId = agent.id;
    const snap = agent.current();
    if (snap) {
      ctx.state.model = snap.model
        ? `${snap.provider}/${snap.model}`
        : snap.provider;
    }
    ctx.setStatus(statusLine(ctx));
    ctx.timeline.appendSystem(`Imported and bound agent ${agent.id}`);
    agent.subscribe((update) => {
      const msg = summarizeAgentUpdate(update);
      if (msg) ctx.timeline.appendAgent(msg);
    });
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
    ctx.setStatus(statusLine(ctx));
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
  ctx.setStatus(statusLine(ctx));
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
      const { provider } = splitProviderModel(current || ctx.state.defaultProvider);
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
  description: "Set reasoning effort (thinkingOptionId when supported)",
  argumentHint: "[level]",
  async run(ctx, args) {
    const level = splitArgs(args);
    if (!level) {
      ctx.timeline.appendSystem(
        `Think level: ${ctx.state.thinkLevel ?? "(unset)"}`,
      );
      return;
    }
    ctx.state.thinkLevel = level;
    ctx.setStatus(statusLine(ctx));

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

export const COMMANDS: SlashCommandDef[] = [
  helpCommand,
  bindCommand,
  newCommand,
  importCommand,
  modelCommand,
  thinkCommand,
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
  const bound = ctx.state.agentId
    ? `bound:${ctx.state.agentId.slice(0, 8)}`
    : "unbound";
  const model = ctx.state.model ? ` model:${ctx.state.model}` : "";
  const think = ctx.state.thinkLevel ? ` think:${ctx.state.thinkLevel}` : "";
  return `${bound}${model}${think}`;
}

function summarizeAgentUpdate(update: unknown): string | null {
  if (!update || typeof update !== "object") return null;
  const u = update as Record<string, unknown>;
  const agent = u.agent as Record<string, unknown> | undefined;
  if (agent?.lastError && typeof agent.lastError === "string") {
    return `error: ${agent.lastError}`;
  }
  if (typeof agent?.status === "string") {
    return `status → ${agent.status}`;
  }
  return null;
}

export async function bindById(ctx: CommandContext, id: string): Promise<void> {
  const client = await ctx.ensureClient();
  const agent = await bindExistingAgent(client, id);
  ctx.state.agent = agent;
  ctx.state.agentId = agent.id;
  const snap = agent.current();
  if (snap) {
    ctx.state.model = snap.model
      ? `${snap.provider}/${snap.model}`
      : snap.provider;
  }
  ctx.setStatus(statusLine(ctx));
  agent.subscribe((update) => {
    const msg = summarizeAgentUpdate(update);
    if (msg) ctx.timeline.appendAgent(msg);
  });
}
