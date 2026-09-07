import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TimelineView } from "./timeline.js";

describe("TimelineView stream coalescing", () => {
  it("merges consecutive reasoning deltas into one block", () => {
    const v = new TimelineView();
    v.appendReasoning("let");
    v.appendReasoning(" me also check");
    v.appendReasoning(" the vendor tree");
    assert.equal(v.container.children.length, 1);
  });

  it("starts a new think after a tool", () => {
    const v = new TimelineView();
    v.appendReasoning("first");
    v.appendTool("Shell [running]\nls", "c1");
    v.appendReasoning("second");
    assert.equal(v.container.children.length, 3);
  });

  it("updates the same tool in place by callId", () => {
    const v = new TimelineView();
    v.appendTool("Shell [running]\nls -la", "c1");
    v.appendToolResult("Shell [completed]\nls -la\nok", true, "c1");
    assert.equal(v.container.children.length, 1);
  });

  it("merges assistant deltas with the same messageId", () => {
    const v = new TimelineView();
    v.appendAgentDelta("我先", "m1");
    v.appendAgentDelta("看一下磁盘", "m1");
    v.appendAgentDelta("我先看一下磁盘占用", "m1");
    assert.equal(v.container.children.length, 1);
  });

  it("batching suppresses intermediate renders", () => {
    const v = new TimelineView();
    let n = 0;
    v.setRequestRender(() => {
      n += 1;
    });
    v.beginBatch();
    v.appendReasoning("a");
    v.appendReasoning("b");
    v.appendUser("hi");
    assert.equal(n, 0);
    v.endBatch();
    assert.equal(n, 1);
  });
});
