import {
  createPaseoClient,
  type PaseoClient,
  type PaseoAgentHandle,
  type PaseoAgentListResult,
} from "@getpaseo/client";

export type ConnectOptions = {
  url: string;
  password?: string;
};

export function createClient(options: ConnectOptions): PaseoClient {
  const timeoutRaw = process.env.PASEO_CONNECT_TIMEOUT_MS;
  const connectTimeoutMs = timeoutRaw
    ? Number.parseInt(timeoutRaw, 10)
    : 5_000;
  return createPaseoClient({
    url: options.url,
    password: options.password ?? process.env.PASEO_PASSWORD,
    connectTimeoutMs: Number.isFinite(connectTimeoutMs) && connectTimeoutMs > 0
      ? connectTimeoutMs
      : 5_000,
    reconnect: { enabled: false },
  });
}

export async function connectClient(options: ConnectOptions): Promise<PaseoClient> {
  const client = createClient(options);
  await client.connect();
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
  },
): Promise<PaseoAgentHandle> {
  return client.agents.create({
    config: { provider: options.provider },
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

  // host, host:port, or http(s)://host:port
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
