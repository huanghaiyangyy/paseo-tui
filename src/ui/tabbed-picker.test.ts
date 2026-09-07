import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderTabBar } from "./tabbed-picker.js";
import type { TabbedPickerItem } from "./format-session.js";

describe("renderTabBar", () => {
  it("marks the active tab and counts per tab", () => {
    const items: TabbedPickerItem[] = [
      { value: "1", label: "a", tabs: ["all", "provider:grok"] },
      { value: "2", label: "b", tabs: ["all", "provider:codex", "cwd"] },
    ];
    const tabs = [
      { id: "all", label: "All" },
      { id: "cwd", label: "This folder" },
      { id: "provider:grok", label: "Grok" },
    ];
    const { line, hits } = renderTabBar(tabs, items, 2, 80);
    assert.equal(hits.length, 3);
    assert.match(line, /All \(2\)/);
    assert.match(line, /This folder \(1\)/);
    assert.match(line, /Grok \(1\)/);
    assert.ok(hits[2]!.end > hits[2]!.start);
  });
});
