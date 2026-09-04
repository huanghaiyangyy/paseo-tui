import { TruncatedText } from "@earendil-works/pi-tui";
import { ansi } from "./theme-dracula.js";

export function createHeader(title = "paseo-tui"): TruncatedText {
  const label =
    ansi.fg.purple(ansi.bold(title)) +
    ansi.fg.comment("  ·  Ghostty-first single-session Paseo TUI");
  return new TruncatedText(label, 1, 0);
}

export function createStatusFooter(text: string): TruncatedText {
  return new TruncatedText(ansi.fg.comment(text), 1, 0);
}
