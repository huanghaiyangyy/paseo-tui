import { SelectList, type SelectItem, type TUI } from "@earendil-works/pi-tui";
import { editorTheme } from "./theme-dracula.js";

export type PickerItem<T extends string = string> = {
  value: T;
  label: string;
  description?: string;
};

/**
 * Show a SelectList overlay and resolve with the chosen value, or null on Escape/cancel.
 */
export function showSelectList<T extends string = string>(
  tui: TUI,
  items: PickerItem<T>[],
  options?: { maxVisible?: number; width?: number | `${number}%` },
): Promise<T | null> {
  if (items.length === 0) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;
    const selectItems: SelectItem[] = items.map((item) => ({
      value: item.value,
      label: item.label,
      description: item.description,
    }));

    const list = new SelectList(
      selectItems,
      options?.maxVisible ?? Math.min(12, Math.max(items.length, 4)),
      editorTheme.selectList,
    );

    const overlay = tui.showOverlay(list, {
      width: options?.width ?? "70%",
      maxHeight: "60%",
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

    list.onSelect = (item) => {
      finish(item.value as T);
    };
    list.onCancel = () => {
      finish(null);
    };

    overlay.focus();
    tui.requestRender();
  });
}
