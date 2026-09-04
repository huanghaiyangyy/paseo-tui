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
import {
  connectBoth,
  footerConnectionLabel,
  formatConnectError,
  isReconnectEnabled,
} from "../client/paseo.js";
import { restoreAgentAfterReconnect } from "../session/attach.js";
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

export async function startApp(options: AppOptions): Promise<void> {
  const defaultProvider =
    options.provider ?? process.env.PASEO_PROVIDER ?? DEFAULT_PROVIDER;
  const reconnectEnabled = isReconnectEnabled();

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
    reconnectEnabled,
    everConnected: false,
    unsubscribeConnection: null,
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
  let restoringAfterReconnect = false;
  let announcedDisconnect = false;

  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    void (async () => {
      try {
        state.daemon?.setReconnectEnabled(false);
      } catch {
        // ignore
      }
      try {
        state.unsubscribeConnection?.();
      } catch {
        // ignore
      }
      state.unsubscribeConnection = null;
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
    state.connectionLabel = footerConnectionLabel({
      status: cs.status,
      attempt: "attempt" in cs ? cs.attempt : undefined,
      reason: "reason" in cs ? cs.reason : undefined,
      reconnectEnabled: state.reconnectEnabled,
      everConnected: state.everConnected,
      stopping,
    });
  };

  const onConnectionStatus = (): void => {
    if (stopping) return;
    const prev = state.connectionLabel;
    const wasEver = state.everConnected;
    const cs = state.daemon?.getConnectionState();
    if (!cs) return;

    if (cs.status === "connected") {
      const isReconnect = wasEver;
      state.everConnected = true;
      announcedDisconnect = false;
      syncConnectionLabel();
      setStatus(statusLine(ctx));
      if (isReconnect && !restoringAfterReconnect) {
        restoringAfterReconnect = true;
        void (async () => {
          try {
            await restoreAgentAfterReconnect(ctx);
            timeline.appendSystem("Reconnected to daemon; subscriptions restored.");
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            timeline.appendError(
              `Reconnect succeeded but failed to restore agent binding: ${message}`,
            );
          } finally {
            restoringAfterReconnect = false;
            syncConnectionLabel();
            setStatus(statusLine(ctx));
          }
        })();
      }
      return;
    }

    syncConnectionLabel();
    setStatus(statusLine(ctx));

    if (cs.status === "disconnected" && wasEver && !announcedDisconnect) {
      announcedDisconnect = true;
      if (state.reconnectEnabled) {
        timeline.appendSystem(
          "Daemon connection lost — reconnecting with backoff…",
        );
      } else {
        timeline.appendError(
          "Daemon connection lost. Auto-reconnect is disabled (PASEO_RECONNECT=0); fix the daemon, then /bind again.",
        );
      }
    } else if (
      cs.status === "connecting" &&
      wasEver &&
      prev !== "reconnecting"
    ) {
      // Footer already shows reconnecting via syncConnectionLabel.
    }
  };

  const wireConnectionWatcher = (daemon: DaemonClient): void => {
    try {
      state.unsubscribeConnection?.();
    } catch {
      // ignore
    }
    state.unsubscribeConnection = daemon.subscribeConnectionStatus(() => {
      onConnectionStatus();
    });
  };

  const ensureConnected = async (): Promise<{
    client: PaseoClient;
    daemon: DaemonClient;
  }> => {
    if (state.client && state.daemon) {
      const cs = state.daemon.getConnectionState();
      if (cs.status === "connected" || cs.status === "connecting") {
        syncConnectionLabel();
        return { client: state.client, daemon: state.daemon };
      }
      // Disconnected but client still held — rely on SDK reconnect or nudge connect.
      try {
        if (state.reconnectEnabled) {
          state.daemon.ensureConnected();
        } else {
          await state.daemon.connect();
        }
      } catch (err) {
        timeline.appendError(
          formatConnectError(err, state.wsUrl, state.reconnectEnabled),
        );
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
      conn = await connectBoth({
        url: state.wsUrl,
        reconnectEnabled: state.reconnectEnabled,
      });
    } catch (err) {
      state.connectionLabel = "disconnected";
      setStatus(statusLine(ctx));
      timeline.appendError(
        formatConnectError(err, state.wsUrl, state.reconnectEnabled),
      );
      throw err;
    }
    state.client = conn.client;
    state.daemon = conn.daemon;
    // Wire before marking everConnected so a sync status callback does not
    // treat the first connect as a reconnect restore.
    wireConnectionWatcher(conn.daemon);
    if (!state.everConnected) {
      state.everConnected = true;
    }
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
    "paseo-tui — one window, one agent session. Slash commands available; plain text prompts the bound agent.",
  );
  if (reconnectEnabled) {
    timeline.appendSystem(
      "Auto-reconnect on (PASEO_RECONNECT=0 to disable).",
    );
  }

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
