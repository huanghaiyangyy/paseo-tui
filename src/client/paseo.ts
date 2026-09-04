import { createPaseoApi, type PaseoClient, type PaseoAgentHandle, type PaseoAgentListResult } from "@getpaseo/client";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";

export type ConnectOptions = {
  url: string;
  password?: string;
};

export type PaseoConnection = {
  client: PaseoClient;
  daemon: DaemonClient;
};

function connectTimeoutMs(): number {
  const timeoutRaw = process.env.PASEO_CONNECT_TIMEOUT_MS;
  const parsed = timeoutRaw ? Number.parseInt(timeoutRaw, 10) : 5_000;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5_000;
}

function buildDaemon(options: ConnectOptions): DaemonClient {
  return new DaemonClient({
    url: options.url,
    clientId: `paseo-tui-${process.pid}-${Date.now()}`,
    clientType: "cli",
    password: options.password ?? process.env.PASEO_PASSWORD,
    connectTimeoutMs: connectTimeoutMs(),
    reconnect: { enabled: false },
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
  return client.agents.list();
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
  const agent = refAgent(client, id);
  await agent.refresh();
  return agent;
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
