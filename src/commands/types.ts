import type { PaseoClient, PaseoAgentHandle } from "@getpaseo/client";

export type TimelineAppender = {
  appendSystem: (text: string) => void;
  appendUser: (text: string) => void;
  appendAgent: (text: string) => void;
  appendError: (text: string) => void;
  clear: () => void;
  requestRender: () => void;
};

export type SessionState = {
  client: PaseoClient | null;
  agent: PaseoAgentHandle | null;
  agentId: string | null;
  model: string | null;
  thinkLevel: string | null;
  wsUrl: string;
  defaultProvider: string;
  unboundTipShown: boolean;
};

export type CommandContext = {
  state: SessionState;
  timeline: TimelineAppender;
  ensureClient: () => Promise<PaseoClient>;
  bindAgent: (id: string) => Promise<void>;
  unbindAgent: () => void;
  stop: () => void;
  setStatus: (text: string) => void;
};

export type SlashCommandDef = {
  name: string;
  description: string;
  argumentHint?: string;
  run: (ctx: CommandContext, args: string) => Promise<void> | void;
};
