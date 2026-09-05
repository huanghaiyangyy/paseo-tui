import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  highlightCode,
  styleToolBlock,
  markdownTheme,
} from "./theme-dracula.js";

const ANSI_RE = /\x1b\[[0-9;]*m/;

describe("highlightCode", () => {
  it("returns ANSI-styled lines for a small TypeScript snippet", () => {
    const src = [
      "const x: number = 1;",
      "// greeting",
      "function hello(name: string) { return 'hi'; }",
    ].join("\n");
    const lines = highlightCode(src, "typescript");
    assert.equal(lines.length, 3);
    assert.ok(
      lines.some((l) => ANSI_RE.test(l)),
      "expected ANSI in highlight output",
    );
    assert.notEqual(lines[0], "const x: number = 1;");
    assert.ok(lines[1].includes("greeting"));
  });

  it("soft-styles unknown languages via codeBlock fallback", () => {
    const lines = highlightCode("hello world", "not-a-real-lang-xyz");
    assert.equal(lines.length, 1);
    assert.ok(lines[0].includes("hello world"));
    assert.ok(ANSI_RE.test(lines[0]));
  });

  it("is wired on markdownTheme", () => {
    assert.equal(typeof markdownTheme.highlightCode, "function");
    const out = markdownTheme.highlightCode!("const a = 1;", "js");
    assert.ok(Array.isArray(out));
    assert.ok(out.length >= 1);
    assert.ok(out.some((l) => ANSI_RE.test(l)));
  });
});

describe("styleToolBlock", () => {
  it("renders unicode box drawing with tool name", () => {
    const block = styleToolBlock("Bash [running]\nls -la");
    assert.ok(block.includes("\u256D"));
    assert.ok(block.includes("\u2502"));
    assert.ok(block.includes("\u2570"));
    assert.ok(block.includes("Bash") || block.includes("\u2699"));
    assert.ok(block.includes("ls -la"));
    assert.ok(ANSI_RE.test(block));
  });
});
