import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAgentTabs,
  buildImportTabs,
  cwdRelated,
  formatAgentPickerItem,
  formatBoundChip,
  formatHeaderTitle,
  formatImportPickerItem,
  formatRelativeTime,
  formatSessionRef,
  itemsForTab,
  normalizeSessionTitle,
  shortCwd,
} from "./format-session.js";

describe("formatRelativeTime", () => {
  const now = Date.parse("2026-09-05T12:00:00Z");
  it("formats buckets", () => {
    assert.equal(formatRelativeTime("2026-09-05T11:59:30Z", now), "just now");
    assert.equal(formatRelativeTime("2026-09-05T11:10:00Z", now), "50m ago");
    assert.equal(formatRelativeTime("2026-09-05T09:00:00Z", now), "3h ago");
    assert.equal(formatRelativeTime("2026-09-03T12:00:00Z", now), "2d ago");
  });
});

describe("shortCwd", () => {
  it("replaces home prefix", () => {
    assert.equal(shortCwd("/home/huang/fawvw_apa_env", "/home/huang"), "~/fawvw_apa_env");
    assert.equal(shortCwd("/home/huang", "/home/huang"), "~");
    assert.equal(shortCwd("/tmp/x", "/home/huang"), "/tmp/x");
  });
});

describe("cwdRelated", () => {
  it("matches the same directory only", () => {
    assert.equal(cwdRelated("/home/huang", "/home/huang"), true);
    assert.equal(
      cwdRelated("/home/huang", "/home/huang/fawvw_apa_env"),
      false,
    );
    assert.equal(cwdRelated("/tmp", "/home/huang"), false);
  });
});

describe("session title helpers", () => {
  it("normalizes whitespace and empty titles", () => {
    assert.equal(normalizeSessionTitle("  fusion   review  "), "fusion review");
    assert.equal(normalizeSessionTitle("   "), null);
    assert.equal(normalizeSessionTitle(null), null);
  });

  it("formats header title, bound chip, and session ref", () => {
    assert.equal(formatHeaderTitle(null, null), "paseo-tui");
    assert.equal(
      formatHeaderTitle(null, "abcdefghijklmnop"),
      "(untitled abcdefgh)",
    );
    assert.equal(formatHeaderTitle("fusion review", "abcdefghijklmnop"), "fusion review");
    assert.equal(formatBoundChip(null), "unbound");
    assert.equal(formatBoundChip("abcdefghijklmnop"), "abcdefgh");
    assert.equal(
      formatBoundChip("abcdefghijklmnop", "fusion review"),
      "fusion review",
    );
    assert.equal(
      formatBoundChip("abcdefghijklmnop", "x".repeat(40), 8),
      "xxxxxxx…",
    );
    assert.equal(formatSessionRef("abcdefghijklmnop"), "abcdefgh");
    assert.equal(
      formatSessionRef("abcdefghijklmnop", "fusion review"),
      "fusion review (abcdefgh)",
    );
  });
});

describe("formatAgentPickerItem", () => {
  it("puts title first and packs status/model/think/id/cwd", () => {
    const item = formatAgentPickerItem(
      {
        id: "40d43296-6e70-42e2-a626-238e8f0463a0",
        title: "安卓三方库-电脑硬盘清理",
        provider: "grok",
        model: "grok-4.6",
        status: "idle",
        cwd: "/home/huang/fawvw_apa_env",
        thinkingOptionId: "xhigh",
        effectiveThinkingOptionId: "xhigh",
        lastUserMessageAt: "2026-09-05T11:00:00Z",
        labels: { task: "fusion" },
      },
      Date.parse("2026-09-05T12:00:00Z"),
    );
    assert.match(item.label, /安卓三方库-电脑硬盘清理/);
    assert.match(item.label, /●/);
    assert.match(item.description ?? "", /idle/);
    assert.match(item.description ?? "", /grok\/grok-4\.6/);
    assert.match(item.description ?? "", /think:xhigh/);
    assert.match(item.description ?? "", /40d43296/);
    assert.match(item.description ?? "", /task:fusion/);
    assert.ok(item.tabs.includes("all"));
    assert.ok(item.tabs.includes("status:idle"));
    assert.ok(item.tabs.includes("provider:grok"));
  });
});

describe("formatImportPickerItem", () => {
  it("tabs by provider and this-folder cwd", () => {
    const item = formatImportPickerItem(
      {
        providerId: "codex",
        providerLabel: "Codex",
        providerHandleId: "abc-handle",
        cwd: "/home/huang/fawvw_apa_env",
        title: "review paseo",
        lastPromptPreview: "please review the fusion report in detail",
        lastActivityAt: "2026-09-05T10:00:00Z",
      },
      "/home/huang/fawvw_apa_env",
      Date.parse("2026-09-05T12:00:00Z"),
    );
    assert.equal(item.label, "review paseo");
    assert.equal(item.value, "codex::abc-handle");
    assert.match(item.description ?? "", /Codex/);
    assert.ok(item.tabs.includes("cwd"));
    assert.ok(item.tabs.includes("provider:codex"));
  });
});

describe("tab builders", () => {
  it("builds bind tabs for status and multi-provider", () => {
    const items = [
      formatAgentPickerItem({
        id: "a",
        title: "one",
        provider: "grok",
        model: "grok-4.6",
        status: "running",
      }),
      formatAgentPickerItem({
        id: "b",
        title: "two",
        provider: "codex",
        model: "gpt-5",
        status: "idle",
      }),
    ];
    const tabs = buildAgentTabs(items);
    const ids = tabs.map((t) => t.id);
    assert.deepEqual(ids[0], "all");
    assert.ok(ids.includes("status:running"));
    assert.ok(ids.includes("status:idle"));
    assert.ok(ids.includes("provider:grok"));
    assert.ok(ids.includes("provider:codex"));
    assert.equal(itemsForTab(items, "status:running").length, 1);
  });

  it("always includes This folder tab for import", () => {
    const items = [
      formatImportPickerItem(
        {
          providerId: "grok",
          providerLabel: "Grok",
          providerHandleId: "h1",
          cwd: "/tmp",
          title: "x",
          lastActivityAt: "2026-09-05T10:00:00Z",
        },
        "/home/huang",
      ),
    ];
    const tabs = buildImportTabs(items);
    assert.equal(tabs[1]?.id, "cwd");
    assert.equal(itemsForTab(items, "cwd").length, 0);
    assert.equal(itemsForTab(items, "provider:grok").length, 1);
  });
});
