import {
  CombinedAutocompleteProvider,
  Editor,
  isViewportTUI,
  Key,
  matchesKey,
  ProcessTerminal,
  ScrollView,
  type TUI,
  TuiAltScreen,
  VStack,
} from "@earendil-works/pi-tui";
import type { PaseoClient } from "@getpaseo/client";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import {
  autocompleteCommands,
  bindById,
  clearAgentBinding,
  dispatchSlash,
  statusLine,
} from "../commands/index.js";
import type { CommandContext, SessionState } from "../commands/types.js";
import { connectBoth } from "../client/paseo.js";
import { createHeader, createStatusFooter } from "./header.js";
import { TimelineView } from "./timeline.js";
import { editorTheme, ansi } from "./theme-dracula.js";

export type AppOptions = {
  wsUrl: string;
  bindId?: string;
  createNew?: boolean;
  provider?: string;
  /** Enter TUI and auto-open the real import picker. */
  runImport?: boolean;
};

const DEFAULT_PROVIDER = "grok-gateway/grok-4.5";

function formatConnectError(err: unknown, wsUrl: string): string {
  const message = err instanceof Error ? err.message : String(err);
  const hints: string[] = [];
  if (/timeout|timed out/i.test(message)) {
    hints.push(
      "Connect timed out — is the Paseo daemon listening?",
      `Tried ${wsUrl}`,
      "Check PASEO_WS_URL / --host, and PASEO_CONNECT_TIMEOUT_MS.",
    );
  } else if (/ECONNREFUSED|not open|connect/i.test(message)) {
    hints.push(
      "Connection refused — start the daemon (default ws://127.0.0.1:6767/ws).",
      `Tried ${wsUrl}`,
    );
  } else {
    hints.push(`Failed to connect to ${wsUrl}: ${message}`);
  }
  hints.push(
    "Auto-reconnect is disabled for TUI sessions to avoid duplicate subscriptions;",
    "use /bind or retry after fixing the daemon.",
  );
  return hints.join("\n");
}

export async function startApp(options: AppOptions): Promise<void> {
  const defaultProvider =
    options.provider ?? process.env.PASEO_PROVIDER ?? DEFAULT_PROVIDER;

  const state: SessionState = {
    client: null,
    daemon: null,
    agent: null,
    agentId: null,
    model: defaultProvider,
    thinkLevel: null,
    wsUrl: options.wsUrl,
    defaultProvider,
    unboundTipShown: false,
    connectionLabel: "idle",
    unsubscribeUpdate: null,
    unsubscribeStream: null,
    pendingPermissions: [],
    seenPermissionIds: new Set(),
  };

  // Filled after helpers; referenced by ensureConnected/stop closures.
  let ctx!: CommandContext;

  const terminal = new ProcessTerminal();
  const tui: TUI = new TuiAltScreen(terminal);
  const timeline = new TimelineView();
  timeline.setRequestRender(() => tui.requestRender());

  const header = createHeader();
  const editor = new Editor(tui, editorTheme);
  editor.setAutocompleteProvider(
    new CombinedAutocompleteProvider(autocompleteCommands(), process.cwd()),
  );

  const editorAndFooter = new VStack([
    editor,
    createStatusFooter(ansi.fg.comment("conn:idle · unbound")),
  ]);

  if (isViewportTUI(tui)) {
    tui.setLayoutRoot(
      new VStack([
        { component: header, basis: "auto", shrink: 0, minSize: 1 },
        {
          component: new ScrollView(timeline.container, {
            follow: "end",
            primary: true,
            overscroll: "chain",
            scrollbar: "auto",
          }),
          basis: 0,
          grow: 1,
          minSize: 1,
        },
        {
          component: editorAndFooter,
          basis: "auto",
          shrink: 1,
          minSize: 1,
        },
      ]),
    );
  }

  let stopping = false;
  let unsubConnection: (() => void) | null = null;

  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    void (async () => {
      try {
        unsubConnection?.();
      } catch {
        // ignore
      }
      try {
        clearAgentBinding(ctx);
      } catch {
        // ignore
      }
      try {
        if (state.daemon) {
          try {
            await state.daemon.setAgentTimelineSubscription([]);
          } catch {
            // ignore
          }
        }
        await state.daemon?.close();
      } catch {
        try {
          await state.client?.close();
        } catch {
          // ignore close errors on shutdown
        }
      }
      tui.stop();
      process.exit(0);
    })();
  };

  const setStatus = (text: string): void => {
    editorAndFooter.clear();
    editorAndFooter.addChild(editor);
    editorAndFooter.addChild(createStatusFooter(ansi.fg.comment(text)));
    tui.requestRender();
  };

  const syncConnectionLabel = (): void => {
    if (!state.daemon) {
      state.connectionLabel = "idle";
      return;
    }
    const cs = state.daemon.getConnectionState();
    if (cs.status === "disconnected") {
      state.connectionLabel = cs.reason
        ? `disconnected(${cs.reason})`
        : "disconnected";
    } else if (cs.status === "connecting") {
      state.connectionLabel = `connecting#${cs.attempt}`;
    } else {
      state.connectionLabel = cs.status;
    }
  };

  const ensureConnected = async (): Promise<{
    client: PaseoClient;
    daemon: DaemonClient;
  }> => {
    if (state.client && state.daemon) {
      try {
        state.client.ensureConnected();
      } catch (err) {
        timeline.appendError(formatConnectError(err, state.wsUrl));
        throw err;
      }
      syncConnectionLabel();
      return { client: state.client, daemon: state.daemon };
    }
    timeline.appendSystem(`Connecting to ${state.wsUrl}…`);
    state.connectionLabel = "connecting";
    setStatus(statusLine(ctx));
    let conn;
    try {
      conn = await connectBoth({ url: state.wsUrl });
    } catch (err) {
      state.connectionLabel = "disconnected";
      setStatus(statusLine(ctx));
      timeline.appendError(formatConnectError(err, state.wsUrl));
      throw err;
    }
    state.client = conn.client;
    state.daemon = conn.daemon;
    unsubConnection?.();
    unsubConnection = conn.daemon.subscribeConnectionStatus(() => {
      syncConnectionLabel();
      setStatus(statusLine(ctx));
      if (state.daemon?.getConnectionState().status === "disconnected") {
        timeline.appendError(
          "Daemon connection lost. Auto-reconnect is disabled for this TUI; restart or fix the daemon, then /bind again.",
        );
      }
    });
    syncConnectionLabel();
    timeline.appendSystem("Connected to Paseo daemon.");
    return conn;
  };

  const ensureClient = async (): Promise<PaseoClient> => {
    const { client } = await ensureConnected();
    return client;
  };

  const ensureDaemon = async (): Promise<DaemonClient> => {
    const { daemon } = await ensureConnected();
    return daemon;
  };

  ctx = {
    state,
    timeline,
    tui,
    ensureClient,
    ensureDaemon,
    bindAgent: async (id: string) => {
      await bindById(ctx, id);
    },
    unbindAgent: () => {
      clearAgentBinding(ctx);
      if (state.daemon) {
        void state.daemon.setAgentTimelineSubscription([]).catch(() => {});
      }
      setStatus(statusLine(ctx));
    },
    stop,
    setStatus,
    statusLine: () => statusLine(ctx),
  };

  editor.onSubmit = (text) => {
    void (async () => {
      const trimmed = text.trim();
      if (!trimmed) return;
      editor.addToHistory(trimmed);
      editor.setText("");

      const handled = await dispatchSlash(ctx, trimmed);
      if (handled) {
        setStatus(statusLine(ctx));
        return;
      }

      if (!state.agent) {
        timeline.appendError(
          "No agent bound. Use /bind, /new, or /import.",
        );
        return;
      }

      timeline.beginLocalTurn(trimmed);
      timeline.appendUser(trimmed);
      setStatus(`${statusLine(ctx)} · running…`);
      try {
        // Prefer live timeline stream; still use run() to submit + wait.
        const result = await state.agent.run(trimmed);
        if (!timeline.didStreamAssistantThisTurn()) {
          if (result.lastMessage) {
            timeline.appendAgent(result.lastMessage);
          } else if (result.error) {
            timeline.appendError(result.error);
          } else if (result.status === "permission") {
            timeline.appendSystem(
              "Turn needs permission — see timeline / use /allow or /deny.",
            );
          } else {
            timeline.appendSystem(`Turn finished (${result.status}).`);
          }
        } else if (result.error && result.status === "error") {
          timeline.appendError(result.error);
        } else if (result.status === "permission") {
          timeline.appendSystem(
            "Turn needs permission — use /allow or /deny.",
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        timeline.appendError(message);
      } finally {
        setStatus(statusLine(ctx));
      }
    })();
  };

  tui.setFocus(editor);
  tui.addInputListener((data) => {
    if (matchesKey(data, Key.ctrl("c"))) {
      stop();
      return { consume: true };
    }
    return undefined;
  });

  timeline.appendSystem(
    "paseo-tui — slash commands available; plain text prompts the bound agent.",
  );

  tui.start();

  try {
    if (options.bindId) {
      await ctx.bindAgent(options.bindId);
      timeline.appendSystem(`Bound to agent ${options.bindId}`);
    } else if (options.createNew) {
      await dispatchSlash(ctx, `/new ${state.defaultProvider}`);
    } else if (options.runImport) {
      await dispatchSlash(ctx, "/import");
    } else {
      timeline.appendSystem(
        "Tip: /bind  ·  /switch  ·  /new (picker)  ·  /import  ·  /model  ·  /think  ·  /help",
      );
      state.unboundTipShown = true;
    }
    setStatus(statusLine(ctx));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    timeline.appendError(`Startup action failed: ${message}`);
    timeline.appendSystem("Continuing unbound. Use /bind or /new when ready.");
    setStatus(statusLine(ctx));
  }
}
