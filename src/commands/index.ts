import type { CommandContext, SlashCommandDef } from "./types.js";
import { createAgent, listAgents, bindExistingAgent } from "../client/paseo.js";

function splitArgs(args: string): string {
  return args.trim();
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
  description: "Create a new agent (idle, or with optional provider/model)",
  argumentHint: "[provider/model]",
  async run(ctx, args) {
    const provider = splitArgs(args) || ctx.state.defaultProvider;
    // Interactive provider picker is stubbed for MVP — use CLI/arg/env.
    const client = await ctx.ensureClient();
    ctx.timeline.appendSystem(`Creating agent with provider ${provider}…`);
    const agent = await createAgent(client, {
      provider,
      cwd: process.cwd(),
      title: "paseo-tui",
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
  },
};

const importCommand: SlashCommandDef = {
  name: "import",
  description: "Import a provider session (stub)",
  async run(ctx) {
    ctx.timeline.appendSystem(
      [
        "Import is not wired yet.",
        "TODO: call daemon import RPCs once exposed on @getpaseo/client",
        "(e.g. recent provider sessions / import session). Use /bind or /new for now.",
      ].join("\n"),
    );
  },
};

const modelCommand: SlashCommandDef = {
  name: "model",
  description: "Show or set local model preference (daemon setAgentModel may need RPC)",
  argumentHint: "[id]",
  async run(ctx, args) {
    const id = splitArgs(args);
    if (!id) {
      ctx.timeline.appendSystem(
        `Current model (local): ${ctx.state.model ?? "(unset)"}\n` +
          "Note: applying a model to a live agent may require a daemon setAgentModel RPC.",
      );
      return;
    }
    ctx.state.model = id;
    ctx.setStatus(statusLine(ctx));
    ctx.timeline.appendSystem(
      `Local model set to ${id}. Live agent model change is stubbed pending daemon RPC.`,
    );
  },
};

const thinkCommand: SlashCommandDef = {
  name: "think",
  description: "Set local reasoning effort level (stub)",
  argumentHint: "[level]",
  async run(ctx, args) {
    const level = splitArgs(args);
    if (!level) {
      ctx.timeline.appendSystem(
        `Think level (local): ${ctx.state.thinkLevel ?? "(unset)"}`,
      );
      return;
    }
    ctx.state.thinkLevel = level;
    ctx.setStatus(statusLine(ctx));
    ctx.timeline.appendSystem(
      `Local think level set to ${level}. Provider thinkingOptionId wiring is stubbed.`,
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
  // Keep streaming noise light for MVP — surface status / error when present.
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
