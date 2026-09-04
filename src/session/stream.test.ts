import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PaseoAgentStream } from "@getpaseo/client";
import { handleAgentStream } from "./stream.js";
import type { TimelineAppender } from "../commands/types.js";

function captureTimeline() {
  const lines: { kind: string; text: string }[] = [];
  const timeline: TimelineAppender = {
    appendSystem: (text) => lines.push({ kind: "system", text }),
    appendUser: (text) => lines.push({ kind: "user", text }),
    appendAgent: (text) => lines.push({ kind: "agent", text }),
    appendError: (text) => lines.push({ kind: "error", text }),
    clear: () => {},
    requestRender: () => {},
    appendAgentDelta: (text) => lines.push({ kind: "agent", text }),
    appendTool: (text) => lines.push({ kind: "tool", text }),
    appendReasoning: (text) => lines.push({ kind: "reasoning", text }),
    appendPermission: (text) => lines.push({ kind: "perm", text }),
  };
  return { lines, timeline };
}

describe("handleAgentStream", () => {
  it("appends assistant and tool timeline items", () => {
    const { lines, timeline } = captureTimeline();
    const payload = {
      agentId: "a1",
      event: {
        type: "timeline",
        provider: "grok-gateway",
        item: { type: "assistant_message", text: "hello", messageId: "m1" },
      },
    } as PaseoAgentStream;
    handleAgentStream(timeline, payload);
    assert.equal(lines.at(-1)?.kind, "agent");
    assert.equal(lines.at(-1)?.text, "hello");

    handleAgentStream(timeline, {
      agentId: "a1",
      event: {
        type: "timeline",
        provider: "grok-gateway",
        item: {
          type: "tool_call",
          callId: "c1",
          name: "bash",
          status: "running",
          error: null,
          detail: { type: "unknown", input: {}, output: null },
        },
      },
    } as PaseoAgentStream);
    assert.equal(lines.at(-1)?.kind, "tool");
    assert.match(lines.at(-1)!.text, /bash/);
  });

  it("surfaces permission_requested", () => {
    const { lines, timeline } = captureTimeline();
    let seen = 0;
    handleAgentStream(
      timeline,
      {
        agentId: "a1",
        event: {
          type: "permission_requested",
          provider: "grok-gateway",
          request: {
            id: "p1",
            provider: "grok-gateway",
            name: "Bash",
            kind: "tool",
            title: "Run bash",
          },
        },
      } as PaseoAgentStream,
      () => {
        seen += 1;
      },
    );
    assert.equal(seen, 1);
    assert.equal(lines.at(-1)?.kind, "perm");
  });

  it("surfaces turn_failed errors", () => {
    const { lines, timeline } = captureTimeline();
    handleAgentStream(timeline, {
      agentId: "a1",
      event: {
        type: "turn_failed",
        provider: "grok-gateway",
        error: "boom",
      },
    } as PaseoAgentStream);
    assert.deepEqual(lines.at(-1), { kind: "error", text: "boom" });
  });
});
