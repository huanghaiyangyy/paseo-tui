import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMMANDS,
  COMMAND_BY_NAME,
  autocompleteCommands,
  statusLine,
} from "./index.js";
import type { CommandContext, SessionState } from "./types.js";

function mockCtx(partial?: Partial<SessionState>): CommandContext {
  const state: SessionState = {
    client: null,
    daemon: null,
    agent: null,
    agentId: null,
    title: null,
    model: "grok-gateway/grok-4.5",
    thinkLevel: null,
    wsUrl: "ws://127.0.0.1:6767/ws",
    defaultProvider: "grok-gateway/grok-4.5",
    unboundTipShown: false,
    connectionLabel: "connected",
    reconnectEnabled: true,
    everConnected: true,
    unsubscribeConnection: null,
    unsubscribeUpdate: null,
    unsubscribeStream: null,
    pendingPermissions: [],
    seenPermissionIds: new Set(),
    usageLabel: null,
    ...partial,
  };
  return {
    state,
    timeline: {
      appendSystem() {},
      appendUser() {},
      appendAgent() {},
      appendError() {},
      clear() {},
      requestRender() {},
    },
    tui: {} as CommandContext["tui"],
    ensureClient: async () => {
      throw new Error("no client");
    },
    ensureDaemon: async () => {
      throw new Error("no daemon");
    },
    bindAgent: async () => {},
    unbindAgent() {},
    stop() {},
    setStatus() {},
    statusLine: () => statusLine(mockCtx({ ...state })),
  };
}

describe("command registry", () => {
  it("registers expected slash commands", () => {
    const names = COMMANDS.map((c) => c.name).sort();
    for (const required of [
      "help",
      "bind",
      "switch",
      "new",
      "import",
      "model",
      "think",
      "thinking",
      "think-expand",
      "expand",
      "collapse",
      "allow",
      "deny",
      "perms",
      "cwd",
      "rename",
      "detach",
      "quit",
    ]) {
      assert.ok(names.includes(required), `missing /${required}`);
      assert.ok(COMMAND_BY_NAME.has(required));
    }
  });

  it("exposes autocomplete entries", () => {
    const ac = autocompleteCommands();
    assert.ok(ac.some((c) => c.name === "switch"));
    assert.ok(ac.some((c) => c.name === "allow"));
    assert.ok(ac.some((c) => c.name === "rename"));
  });

  it("statusLine includes connection and bind state", () => {
    const line = statusLine(
      mockCtx({
        connectionLabel: "connected",
        agentId: "abcdefghijklmnop",
        model: "grok-gateway/grok-4.5",
        thinkLevel: "high",
      }),
    );
    assert.match(line, /conn:connected/);
    assert.match(line, /bound:abcdefgh/);
    assert.match(line, /model:grok-gateway\/grok-4\.5/);
    assert.match(line, /think:high/);
  });

  it("statusLine shows reconnecting footer label", () => {
    const line = statusLine(mockCtx({ connectionLabel: "reconnecting" }));
    assert.match(line, /conn:reconnecting/);
    assert.match(line, /unbound/);
  });

  it("statusLine prefers session title when bound", () => {
    const line = statusLine(
      mockCtx({
        connectionLabel: "connected",
        agentId: "abcdefghijklmnop",
        title: "fusion review",
      }),
    );
    assert.match(line, /bound:fusion review/);
    assert.doesNotMatch(line, /bound:abcdefgh/);
  });
});

describe("/rename", () => {
  it("requires a bound agent", async () => {
    const lines: string[] = [];
    const ctx = mockCtx();
    ctx.timeline.appendSystem = (text) => {
      lines.push(text);
    };
    await COMMAND_BY_NAME.get("rename")!.run(ctx, "new name");
    assert.match(lines.join("\n"), /No agent bound/);
  });

  it("shows current title when no args", async () => {
    const lines: string[] = [];
    const ctx = mockCtx({
      agentId: "abcdefghijklmnop",
      title: "fusion review",
      agent: { id: "abcdefghijklmnop" } as unknown as CommandContext["state"]["agent"],
    });
    ctx.timeline.appendSystem = (text) => {
      lines.push(text);
    };
    await COMMAND_BY_NAME.get("rename")!.run(ctx, "  ");
    assert.match(lines.join("\n"), /fusion review/);
    assert.match(lines.join("\n"), /\/rename/);
  });

  it("calls updateAgent and stores the new title", async () => {
    const calls: Array<{ id: string; name?: string }> = [];
    const ctx = mockCtx({
      agentId: "abcdefghijklmnop",
      title: "old",
    });
    ctx.state.agent = {
      id: "abcdefghijklmnop",
      refresh: async () => ({
        agent: { title: "new title" },
        project: null,
      }),
      current: () => ({ title: "new title" }),
    } as unknown as CommandContext["state"]["agent"];
    ctx.ensureDaemon = async () =>
      ({
        updateAgent: async (id: string, updates: { name?: string }) => {
          calls.push({ id, name: updates.name });
        },
      }) as unknown as Awaited<ReturnType<CommandContext["ensureDaemon"]>>;
    const lines: string[] = [];
    ctx.timeline.appendSystem = (text) => {
      lines.push(text);
    };
    await COMMAND_BY_NAME.get("rename")!.run(ctx, '  "new title"  ');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.id, "abcdefghijklmnop");
    assert.equal(calls[0]?.name, "new title");
    assert.equal(ctx.state.title, "new title");
    assert.match(lines.join("\n"), /Session renamed to new title/);
  });

  it("rejects titles over the protocol limit", async () => {
    const errors: string[] = [];
    const ctx = mockCtx({
      agentId: "abcdefghijklmnop",
      agent: { id: "abcdefghijklmnop" } as unknown as CommandContext["state"]["agent"],
    });
    ctx.timeline.appendError = (text) => {
      errors.push(text);
    };
    let called = false;
    ctx.ensureDaemon = async () =>
      ({
        updateAgent: async () => {
          called = true;
        },
      }) as unknown as Awaited<ReturnType<CommandContext["ensureDaemon"]>>;
    await COMMAND_BY_NAME.get("rename")!.run(ctx, "x".repeat(201));
    assert.equal(called, false);
    assert.match(errors.join("\n"), /too long/);
  });
});
