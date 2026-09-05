import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCostUsd,
  formatCtxPercent,
  formatTokenCount,
  formatUsageChips,
  readAgentUsage,
} from "./usage.js";

describe("usage formatting", () => {
  it("formats token counts compactly", () => {
    assert.equal(formatTokenCount(42), "42");
    assert.equal(formatTokenCount(1200), "1.2k");
    assert.equal(formatTokenCount(15_000), "15k");
    assert.equal(formatTokenCount(2_500_000), "2.5M");
  });

  it("formats cost and ctx%", () => {
    assert.equal(formatCostUsd(0.0012), "$0.0012");
    assert.equal(formatCostUsd(0.045), "$0.045");
    assert.equal(formatCostUsd(1.5), "$1.50");
    assert.equal(formatCtxPercent(4500, 10_000), "45%");
    assert.equal(formatCtxPercent(undefined, 10_000), null);
    assert.equal(formatCtxPercent(100, 0), null);
  });

  it("builds footer chips and graceful null", () => {
    assert.equal(formatUsageChips(null), null);
    assert.equal(formatUsageChips({}), null);
    const chip = formatUsageChips({
      inputTokens: 1200,
      outputTokens: 340,
      totalCostUsd: 0.012,
      contextWindowUsedTokens: 4500,
      contextWindowMaxTokens: 10_000,
    });
    assert.ok(chip);
    assert.match(chip!, /↑1\.2k/);
    assert.match(chip!, /↓340/);
    assert.match(chip!, /\$0\.012/);
    assert.match(chip!, /ctx 45%/);
  });

  it("reads lastUsage from agent handle", () => {
    assert.equal(readAgentUsage(null), null);
    assert.deepEqual(
      readAgentUsage({ lastUsage: { inputTokens: 1 } }),
      { inputTokens: 1 },
    );
    assert.deepEqual(
      readAgentUsage({
        lastUsage: null,
        current: () => ({ lastUsage: { outputTokens: 9 } }),
      }),
      { outputTokens: 9 },
    );
  });
});
