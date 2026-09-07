import {
  Key,
  SelectList,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type Component,
  type SelectItem,
  type TUI,
  type TuiMouseEvent,
  type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import { ansi, editorTheme } from "./theme-dracula.js";
import {
  itemsForTab,
  type TabSpec,
  type TabbedPickerItem,
} from "./format-session.js";

type TabHit = { index: number; start: number; end: number };

class TabbedSelectList implements Component {
  private readonly tabs: TabSpec[];
  private readonly allItems: TabbedPickerItem[];
  private readonly maxVisible: number;
  private readonly hint: string;
  private active = 0;
  private list: SelectList;
  private tabHits: TabHit[] = [];
  onSelect?: (item: SelectItem) => void;
  onCancel?: () => void;

  constructor(
    items: TabbedPickerItem[],
    tabs: TabSpec[],
    maxVisible: number,
    hint: string,
  ) {
    this.allItems = items;
    this.tabs = tabs.length ? tabs : [{ id: "all", label: "All" }];
    this.maxVisible = maxVisible;
    this.hint = hint;
    this.list = this.makeList(this.tabs[0]!.id);
  }

  invalidate(): void {
    this.list.invalidate();
  }

  render(width: number): string[] {
    const w = Math.max(8, width);
    const { line, hits } = renderTabBar(this.tabs, this.allItems, this.active, w);
    this.tabHits = hits;
    const hint = ansi.fg.comment(truncateToWidth(this.hint, w));
    const listLines = this.list.render(w);
    return [line, hint, ...listLines];
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
      this.cycle(1);
      return;
    }
    if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
      this.cycle(-1);
      return;
    }
    const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
    for (let i = 0; i < Math.min(digits.length, this.tabs.length); i++) {
      if (matchesKey(data, digits[i]!)) {
        this.setActive(i);
        return;
      }
    }
    this.list.handleInput(data);
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.y === 0) {
      if (event.type === "click" || event.type === "press") {
        const hit = this.tabHits.find(
          (h) => event.x >= h.start && event.x < h.end,
        );
        if (hit) {
          this.setActive(hit.index);
          return { handled: true, focus: true, render: true };
        }
      }
      return { handled: true };
    }
    if (event.y === 1) {
      return { handled: true };
    }
    const inner: TuiMouseEvent = {
      ...event,
      y: event.y - 2,
      height: Math.max(1, event.height - 2),
    };
    return this.list.handleMouse(inner);
  }

  private cycle(delta: number): void {
    const n = this.tabs.length;
    this.setActive((this.active + delta + n) % n);
  }

  private setActive(index: number): void {
    const next = Math.max(0, Math.min(index, this.tabs.length - 1));
    if (next === this.active && this.list) {
      return;
    }
    this.active = next;
    this.list = this.makeList(this.tabs[this.active]!.id);
  }

  private makeList(tabId: string): SelectList {
    const rows = itemsForTab(this.allItems, tabId).map((item) => ({
      value: item.value,
      label: item.label,
      description: item.description,
    }));
    const list = new SelectList(
      rows,
      this.maxVisible,
      editorTheme.selectList,
      { minPrimaryColumnWidth: 28, maxPrimaryColumnWidth: 52 },
    );
    list.onSelect = (item) => this.onSelect?.(item);
    list.onCancel = () => this.onCancel?.();
    return list;
  }
}

export function renderTabBar(
  tabs: TabSpec[],
  items: TabbedPickerItem[],
  activeIndex: number,
  width: number,
): { line: string; hits: TabHit[] } {
  const hits: TabHit[] = [];
  let line = "";
  let x = 0;
  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i]!;
    const count =
      tab.id === "all"
        ? items.length
        : items.filter((it) => it.tabs.includes(tab.id)).length;
    const raw = ` ${tab.label} (${count}) `;
    if (i > 0) {
      const sep = ansi.fg.comment("│");
      line += sep;
      x += visibleWidth("│");
    }
    const start = x;
    const painted =
      i === activeIndex ? ansi.fg.pink(ansi.bold(raw)) : ansi.fg.comment(raw);
    line += painted;
    x += visibleWidth(raw);
    hits.push({ index: i, start, end: x });
  }
  if (x < width) {
    line += ansi.fg.comment("─".repeat(Math.max(0, width - x)));
  } else if (x > width) {
    line = truncateToWidth(line, width);
  }
  return { line, hits };
}

export function showTabbedSelectList<T extends string = string>(
  tui: TUI,
  items: TabbedPickerItem<T>[],
  tabs: TabSpec[],
  options?: {
    maxVisible?: number;
    width?: number | `${number}%`;
    hint?: string;
  },
): Promise<T | null> {
  if (items.length === 0) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;
    const picker = new TabbedSelectList(
      items,
      tabs,
      options?.maxVisible ?? Math.min(14, Math.max(items.length, 6)),
      options?.hint ?? "Tab/←→ switch tabs · Enter select · Esc cancel",
    );

    const overlay = tui.showOverlay(picker, {
      width: options?.width ?? "92%",
      maxHeight: "75%",
      anchor: "center",
      margin: 1,
    });

    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      try {
        overlay.hide();
      } catch {
        // overlay may already be gone
      }
      tui.requestRender();
      resolve(value);
    };

    picker.onSelect = (item) => {
      finish(item.value as T);
    };
    picker.onCancel = () => {
      finish(null);
    };

    overlay.focus();
    tui.requestRender();
  });
}
