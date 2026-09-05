import { createRequire } from "node:module";
import { createPaseoApi, type PaseoClient, type PaseoAgentHandle, type PaseoAgentListResult } from "@getpaseo/client";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { reconnectOptions } from "./reconnect.js";

export type ConnectOptions = {
  url: string;
  password?: string;
  /** Override env; when omitted, PASEO_RECONNECT controls SDK reconnect. */
  reconnectEnabled?: boolean;
  /** Override hello appVersion (tests). Defaults to package.json version. */
  appVersion?: string;
};

export type PaseoConnection = {
  client: PaseoClient;
  daemon: DaemonClient;
};

const require = createRequire(import.meta.url);

/** App version advertised in the daemon hello handshake. */
export function resolveAppVersion(override?: string): string {
  if (override && override.trim().length > 0) return override.trim();
  try {
    const pkg = require("../../package.json") as { version?: unknown };
    if (typeof pkg.version === "string" && pkg.version.trim().length > 0) {
      return pkg.version.trim();
    }
  } catch {
    // fall through
  }
  // Daemon hides non-legacy providers (e.g. grok-gateway) unless appVersion >= 0.1.45.
  return "0.1.45";
}

/** Default fetchAgents options: active workspaces, enough page size for picker. */
export const DEFAULT_LIST_AGENTS_OPTIONS = {
  scope: "active" as const,
  page: { limit: 100 },
};

function connectTimeoutMs(): number {
  const timeoutRaw = process.env.PASEO_CONNECT_TIMEOUT_MS;
  const parsed = timeoutRaw ? Number.parseInt(timeoutRaw, 10) : 5_000;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5_000;
}

function buildDaemon(options: ConnectOptions): DaemonClient {
  const reconnect = reconnectOptions();
  const enabled =
    options.reconnectEnabled !== undefined
      ? options.reconnectEnabled
      : reconnect.enabled;
  return new DaemonClient({
    url: options.url,
    clientId: `paseo-tui-${process.pid}-${Date.now()}`,
    clientType: "cli",
    // Without appVersion >= 0.1.45 the daemon only surfaces legacy providers
    // (claude/codex/opencode), so idle grok-gateway agents look "not found".
    appVersion: resolveAppVersion(options.appVersion),
    password: options.password ?? process.env.PASEO_PASSWORD,
    connectTimeoutMs: connectTimeoutMs(),
    reconnect: {
      enabled,
      baseDelayMs: reconnect.baseDelayMs,
      maxDelayMs: reconnect.maxDelayMs,
    },
  });
}

/** Create a PaseoClient + DaemonClient sharing one WebSocket connection. */
export function createConnection(options: ConnectOptions): PaseoConnection {
  const daemon = buildDaemon(options);
  const api = createPaseoApi(daemon);
  const client: PaseoClient = {
    ...api,
    connect: () => daemon.connect(),
    close: () => daemon.close(),
    ensureConnected: () => daemon.ensureConnected(),
    getConnectionState: () => daemon.getConnectionState(),
  };
  return { client, daemon };
}

export async function connectBoth(options: ConnectOptions): Promise<PaseoConnection> {
  const conn = createConnection(options);
  await conn.daemon.connect();
  return conn;
}

/** @deprecated Prefer connectBoth — kept for call sites that only need the high-level API. */
export async function connectClient(options: ConnectOptions): Promise<PaseoClient> {
  const { client } = await connectBoth(options);
  return client;
}

export async function listAgents(client: PaseoClient): Promise<PaseoAgentListResult> {
  return client.agents.list(DEFAULT_LIST_AGENTS_OPTIONS);
}

export async function createAgent(
  client: PaseoClient,
  options: {
    provider: string;
    cwd?: string;
    title?: string;
    prompt?: string;
    thinkingOptionId?: string;
  },
): Promise<PaseoAgentHandle> {
  return client.agents.create({
    config: {
      provider: options.provider,
      ...(options.thinkingOptionId
        ? { thinkingOptionId: options.thinkingOptionId }
        : {}),
    },
    cwd: options.cwd ?? process.cwd(),
    title: options.title ?? "paseo-tui",
    prompt: options.prompt,
  });
}

export function refAgent(client: PaseoClient, id: string): PaseoAgentHandle {
  return client.agents.ref(id);
}

export async function bindExistingAgent(
  client: PaseoClient,
  id: string,
): Promise<PaseoAgentHandle> {
  const trimmed = id.trim();
  if (!trimmed) {
    throw new Error("Agent id cannot be empty");
  }

  // Prefer exact refresh; if that fails (short prefix / stale), resolve via list.
  const agent = refAgent(client, trimmed);
  try {
    const result = await agent.refresh();
    if (result?.agent) {
      return agent;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Fall through to list-based resolve for short ids / visibility race.
    if (!/not found/i.test(message) && trimmed.length >= 32) {
      throw err instanceof Error ? err : new Error(message);
    }
  }

  const page = await listAgents(client);
  const matches = page.entries
    .map((e) => e.agent)
    .filter((a) => a.id === trimmed || a.id.startsWith(trimmed));
  if (matches.length === 1) {
    const resolved = refAgent(client, matches[0]!.id);
    const result = await resolved.refresh();
    if (!result?.agent) {
      throw new Error(`Agent not found: ${matches[0]!.id}`);
    }
    return resolved;
  }
  if (matches.length > 1) {
    throw new Error(
      `Agent identifier "${trimmed}" is ambiguous (${matches
        .slice(0, 5)
        .map((a) => a.id.slice(0, 8))
        .join(", ")}${matches.length > 5 ? ", …" : ""})`,
    );
  }
  throw new Error(`Agent not found: ${trimmed}`);
}

/** Map host[:port] or full ws URL to a daemon WebSocket URL. */
export function resolveWsUrl(hostOrUrl?: string): string {
  const fromEnv = process.env.PASEO_WS_URL ?? process.env.PASEO_HOST;
  const raw = (hostOrUrl ?? fromEnv ?? "ws://127.0.0.1:6767/ws").trim();

  if (raw.startsWith("ws://") || raw.startsWith("wss://")) {
    return raw.endsWith("/ws") || raw.includes("/ws?") ? raw : joinWsPath(raw);
  }

  let hostPort = raw;
  if (raw.startsWith("http://")) hostPort = raw.slice("http://".length);
  if (raw.startsWith("https://")) hostPort = raw.slice("https://".length);
  hostPort = hostPort.replace(/\/+$/, "").replace(/\/ws$/, "");
  if (!hostPort.includes(":")) hostPort = `${hostPort}:6767`;
  const scheme = raw.startsWith("https://") ? "wss" : "ws";
  return `${scheme}://${hostPort}/ws`;
}

function joinWsPath(url: string): string {
  return url.replace(/\/+$/, "") + "/ws";
}

export { isReconnectEnabled, reconnectOptions, footerConnectionLabel, reconnectDelayMs, formatConnectError } from "./reconnect.js";
