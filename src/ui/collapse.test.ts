import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCollapsedThinkSummary,
  formatCollapsedToolSummary,
  hasCompleteFenceBlocks,
  parseToolText,
  shouldAutoCollapseThink,
  shouldAutoCollapseTool,
  THINK_EXPAND_MAX_CHARS,
} from "./collapse.js";

describe("tool collapse helpers", () => {
  it("parses name/status/body", () => {
    const p = parseToolText("Bash [running]\nls -la\nfoo\nbar");
    assert.equal(p.name, "Bash");
    assert.equal(p.status, "running");
    assert.deepEqual(p.bodyLines, ["ls -la", "foo", "bar"]);
  });

  it("auto-collapses when body longer than 2 lines", () => {
    assert.equal(shouldAutoCollapseTool("Bash [running]\nls"), false);
    assert.equal(shouldAutoCollapseTool("Bash [running]\na\nb"), false);
    assert.equal(shouldAutoCollapseTool("Bash [running]\na\nb\nc"), true);
  });

  it("formats collapsed summary with /expand hint", () => {
    const s = formatCollapsedToolSummary(
      "Bash [running]\nls -la /tmp\nmore\nlines",
    );
    assert.match(s, /tool · Bash/);
    assert.match(s, /ls -la/);
    assert.match(s, /\(3 lines\)/);
    assert.match(s, /\/expand/);
  });
});

describe("think collapse helpers", () => {
  it("auto-collapses long think", () => {
    assert.equal(shouldAutoCollapseThink("short"), false);
    assert.equal(
      shouldAutoCollapseThink("x".repeat(THINK_EXPAND_MAX_CHARS)),
      true,
    );
  });

  it("formats collapsed think summary", () => {
    const long = "reasoning " + "word ".repeat(40);
    const s = formatCollapsedThinkSummary(long);
    assert.match(s, /^think · /);
    assert.match(s, /chars\)/);
    assert.match(s, /\/think-expand/);
  });
});

describe("fence completeness", () => {
  it("detects complete fenced blocks", () => {
    assert.equal(hasCompleteFenceBlocks("plain text"), false);
    assert.equal(hasCompleteFenceBlocks("```ts\nconst x = 1;"), false);
    assert.equal(
      hasCompleteFenceBlocks("```ts\nconst x = 1;\n```"),
      true,
    );
    assert.equal(
      hasCompleteFenceBlocks("```ts\na\n```\n\n```bash\nb"),
      false,
    );
    assert.equal(
      hasCompleteFenceBlocks("```ts\na\n```\n\n```bash\nb\n```"),
      true,
    );
  });
});
