import type { TUI } from "@earendil-works/pi-tui";
import type { PaseoClient, PaseoAgentHandle } from "@getpaseo/client";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { AgentPermissionRequest } from "@getpaseo/protocol/agent-types";

export type TimelineAppender = {
  appendSystem: (text: string) => void;
  appendUser: (text: string) => void;
  appendAgent: (text: string) => void;
  appendError: (text: string) => void;
  clear: () => void;
  requestRender: () => void;
  beginLocalTurn?: (userText: string) => void;
  didStreamAssistantThisTurn?: () => boolean;
  appendAgentDelta?: (text: string, messageId?: string) => void;
  appendTool?: (text: string) => void;
  appendReasoning?: (text: string) => void;
  appendPermission?: (text: string) => void;
};

export type SessionState = {
  client: PaseoClient | null;
  daemon: DaemonClient | null;
  agent: PaseoAgentHandle | null;
  agentId: string | null;
  model: string | null;
  thinkLevel: string | null;
  wsUrl: string;
  defaultProvider: string;
  unboundTipShown: boolean;
  /** Connection footer label (connected|reconnecting|disconnected|…). */
  connectionLabel: string;
  /** Whether SDK/app auto-reconnect is enabled for this session. */
  reconnectEnabled: boolean;
  /** True after at least one successful daemon connect. */
  everConnected: boolean;
  /** Unsubscribe fns — always call before re-subscribe to avoid duplicates. */
  unsubscribeConnection: (() => void) | null;
  unsubscribeUpdate: (() => void) | null;
  unsubscribeStream: (() => void) | null;
  pendingPermissions: AgentPermissionRequest[];
  seenPermissionIds: Set<string>;
};

export type CommandContext = {
  state: SessionState;
  timeline: TimelineAppender;
  tui: TUI;
  ensureClient: () => Promise<PaseoClient>;
  ensureDaemon: () => Promise<DaemonClient>;
  bindAgent: (id: string) => Promise<void>;
  unbindAgent: () => void;
  stop: () => void;
  setStatus: (text: string) => void;
  statusLine: () => string;
};

export type SlashCommandDef = {
  name: string;
  description: string;
  argumentHint?: string;
  run: (ctx: CommandContext, args: string) => Promise<void> | void;
};
