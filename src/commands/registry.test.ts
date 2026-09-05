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
});
