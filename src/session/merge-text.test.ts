import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeStreamText } from "./merge-text.js";

describe("mergeStreamText", () => {
  it("appends deltas", () => {
    assert.equal(mergeStreamText("let", " me"), "let me");
    assert.equal(mergeStreamText("", "let"), "let");
    assert.equal(mergeStreamText("let", ""), "let");
  });

  it("replaces when incoming is a growing snapshot", () => {
    assert.equal(mergeStreamText("hel", "hello"), "hello");
    assert.equal(mergeStreamText("hello", "hello"), "hello");
  });

  it("ignores a stale shorter snapshot", () => {
    assert.equal(mergeStreamText("hello", "hel"), "hello");
  });

  it("catchup skips deltas already in the hydrated text", () => {
    const hydrated = "let me also check the vendor tree";
    assert.equal(
      mergeStreamText(hydrated, " me also check the vendor tree", "catchup"),
      hydrated,
    );
    assert.equal(
      mergeStreamText(hydrated, "also check the vendor", "catchup"),
      hydrated,
    );
  });

  it("catchup still appends genuinely new tokens", () => {
    assert.equal(
      mergeStreamText("let me", " also check", "catchup"),
      "let me also check",
    );
  });
});
