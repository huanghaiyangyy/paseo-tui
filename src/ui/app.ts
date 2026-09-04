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

export async function startApp(options: AppOptions): Promise<void> {
  const defaultProvider =
    options.provider ?? process.env.PASEO_PROVIDER ?? "codex/gpt-5.5";

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
  };

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
    createStatusFooter(ansi.fg.comment("unbound")),
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
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    void (async () => {
      try {
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

  const ensureConnected = async (): Promise<{
    client: PaseoClient;
    daemon: DaemonClient;
  }> => {
    if (state.client && state.daemon) {
      state.client.ensureConnected();
      return { client: state.client, daemon: state.daemon };
    }
    timeline.appendSystem(`Connecting to ${state.wsUrl}…`);
    const conn = await connectBoth({ url: state.wsUrl });
    state.client = conn.client;
    state.daemon = conn.daemon;
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

  const ctx: CommandContext = {
    state,
    timeline,
    tui,
    ensureClient,
    ensureDaemon,
    bindAgent: async (id: string) => {
      await bindById(ctx, id);
    },
    unbindAgent: () => {
      state.agent = null;
      state.agentId = null;
      setStatus(statusLine(ctx));
    },
    stop,
    setStatus,
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

      timeline.appendUser(trimmed);
      setStatus(`${statusLine(ctx)} · running…`);
      try {
        const result = await state.agent.run(trimmed);
        if (result.lastMessage) {
          timeline.appendAgent(result.lastMessage);
        } else if (result.error) {
          timeline.appendError(result.error);
        } else {
          timeline.appendSystem(`Turn finished (${result.status}).`);
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
        "Tip: /bind  ·  /new (picker)  ·  /import  ·  /model  ·  /help",
      );
      state.unboundTipShown = true;
    }
    setStatus(statusLine(ctx));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    timeline.appendError(`Startup action failed: ${message}`);
    timeline.appendSystem("Continuing unbound. Use /bind or /new when ready.");
  }
}
