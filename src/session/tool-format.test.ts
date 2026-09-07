import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatToolCallText, formatToolInputPreview } from "./tool-format.js";

describe("formatToolInputPreview", () => {
  it("reads canonical shell/read/search fields (not detail.input)", () => {
    assert.equal(
      formatToolInputPreview({ type: "shell", command: "ls -la", output: "ok" }),
      "ls -la",
    );
    assert.equal(
      formatToolInputPreview({ type: "read", filePath: "/tmp/a.ts" }),
      "/tmp/a.ts",
    );
    assert.equal(
      formatToolInputPreview({ type: "search", query: "TODO" }),
      "TODO",
    );
  });

  it("reads grok-style unknown input keys", () => {
    assert.equal(
      formatToolInputPreview({
        type: "unknown",
        input: { target_file: "/home/huang/x.md" },
        output: null,
      }),
      "/home/huang/x.md",
    );
  });

  it("returns null for empty unknown input", () => {
    assert.equal(
      formatToolInputPreview({ type: "unknown", input: {}, output: null }),
      null,
    );
  });
});

describe("formatToolCallText", () => {
  it("shows shell command and clipped output", () => {
    const text = formatToolCallText({
      name: "execute",
      status: "completed",
      callId: "c1",
      error: null,
      detail: {
        type: "shell",
        command: "echo hi",
        output: "hi\n",
      },
    });
    assert.match(text, /\[completed\]/);
    assert.match(text, /echo hi/);
    assert.match(text, /hi/);
    assert.doesNotMatch(text, /no preview/);
  });

  it("shows edit filePath instead of empty preview", () => {
    const text = formatToolCallText({
      name: "edit",
      status: "completed",
      error: null,
      detail: {
        type: "edit",
        filePath: "/tmp/a.md",
        oldString: "a",
        newString: "b",
      },
    });
    assert.match(text, /\/tmp\/a\.md/);
  });

  it("falls back to metadata.title when detail has no preview", () => {
    const text = formatToolCallText({
      name: "execute",
      status: "running",
      error: null,
      metadata: { title: "Execute `true`" },
      detail: { type: "unknown", input: {}, output: null },
    });
    assert.match(text, /Execute `true`/);
  });
});
