import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HeaderBar, StatusFooter } from "./header.js";

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

describe("HeaderBar", () => {
  it("renders the session title instead of the default brand", () => {
    const header = new HeaderBar();
    header.setTitle("fusion review");
    header.setChips({
      model: "grok-gateway/grok-4.6",
      agentId: "abcdefghijklmnop",
      conn: "connected",
    });
    const [line] = header.render(120);
    const plain = stripAnsi(line ?? "");
    assert.match(plain, /fusion review/);
    assert.match(plain, /grok-4\.6/);
    assert.match(plain, /abcdefgh/);
    assert.doesNotMatch(plain, /paseo-tui/);
  });
});

describe("StatusFooter", () => {
  it("shows the session name on the bound chip", () => {
    const footer = new StatusFooter({
      conn: "connected",
      bound: "fusion review",
      model: "grok-gateway/grok-4.6",
    });
    const [line] = footer.render(120);
    const plain = stripAnsi(line ?? "");
    assert.match(plain, /fusion review/);
    assert.match(plain, /connected/);
  });
});
