/** Safe auto-reconnect helpers for single-session paseo-tui. */

export type ReconnectOptions = {
  enabled: boolean;
  baseDelayMs: number;
  maxDelayMs: number;
};

const DEFAULT_BASE_MS = 1_000;
const DEFAULT_MAX_MS = 30_000;

/**
 * PASEO_RECONNECT=0|false|off|no disables reconnect.
 * Unset / anything else → enabled (default on for polish).
 */
export function isReconnectEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = (env.PASEO_RECONNECT ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") {
    return false;
  }
  return true;
}

export function reconnectOptions(
  env: NodeJS.ProcessEnv = process.env,
): ReconnectOptions {
  return {
    enabled: isReconnectEnabled(env),
    baseDelayMs: DEFAULT_BASE_MS,
    maxDelayMs: DEFAULT_MAX_MS,
  };
}

/**
 * Normalize daemon connection status into footer labels:
 * connected | reconnecting | disconnected
 * (plus brief "connecting" / "idle" before first successful link).
 */
export function footerConnectionLabel(input: {
  status: string;
  attempt?: number;
  reason?: string;
  reconnectEnabled: boolean;
  everConnected: boolean;
  stopping?: boolean;
}): string {
  const { status, reconnectEnabled, everConnected, stopping } = input;
  if (stopping) return "disconnected";
  switch (status) {
    case "connected":
      return "connected";
    case "connecting":
      return everConnected ? "reconnecting" : "connecting";
    case "disconnected":
      if (reconnectEnabled && everConnected) return "reconnecting";
      return "disconnected";
    case "disposed":
    case "idle":
    default:
      return everConnected ? "disconnected" : status === "idle" ? "idle" : "disconnected";
  }
}

/** Exponential backoff delays used by the SDK: base * 2^attempt, capped at max. */
export function reconnectDelayMs(
  attempt: number,
  baseDelayMs = DEFAULT_BASE_MS,
  maxDelayMs = DEFAULT_MAX_MS,
): number {
  const a = Math.max(0, Math.floor(attempt));
  return Math.min(baseDelayMs * 2 ** a, maxDelayMs);
}

/** Clearer connect-failure message for the timeline (no stack dump). */
export function formatConnectError(
  err: unknown,
  wsUrl: string,
  reconnectEnabled: boolean,
): string {
  const message = err instanceof Error ? err.message : String(err);
  const hints: string[] = [];
  if (/timeout|timed out/i.test(message)) {
    hints.push(
      "Connect timed out — is the Paseo daemon listening?",
      `Tried ${wsUrl}`,
      "Check PASEO_WS_URL / --host, and PASEO_CONNECT_TIMEOUT_MS (default 5000).",
    );
  } else if (/ECONNREFUSED/i.test(message)) {
    hints.push(
      "Connection refused — start the Paseo daemon (default ws://127.0.0.1:6767/ws).",
      `Tried ${wsUrl}`,
      "If the daemon uses another port, set --host or PASEO_WS_URL.",
    );
  } else if (/not open|connect|ENOTFOUND|EHOSTUNREACH/i.test(message)) {
    hints.push(
      `Could not reach daemon at ${wsUrl}`,
      message,
      "Verify the daemon is running and the URL/password are correct.",
    );
  } else {
    hints.push(`Failed to connect to ${wsUrl}: ${message}`);
  }
  if (reconnectEnabled) {
    hints.push(
      "Auto-reconnect is on (backoff up to ~30s). Fix the daemon; the TUI will retry.",
      "Set PASEO_RECONNECT=0 to disable.",
    );
  } else {
    hints.push(
      "Auto-reconnect is off (PASEO_RECONNECT=0). Fix the daemon, then retry /bind.",
    );
  }
  return hints.join("\n");
}
