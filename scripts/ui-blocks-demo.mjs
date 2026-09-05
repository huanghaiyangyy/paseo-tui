#!/usr/bin/env node
/**
 * Demo: Markdown headings/lists/fenced code/quotes + Codex-like tool block.
 * Launched under Ghostty for ui-blocks-md.png.
 */
import {
  ProcessTerminal,
  TuiAltScreen,
  isViewportTUI,
  VStack,
  ScrollView,
  Editor,
  Text,
  Container,
  Markdown,
  Spacer,
} from "@earendil-works/pi-tui";
import {
  editorTheme,
  ansi,
  styleSystem,
  styleUser,
  styleToolBlock,
  labelAgent,
  markdownTheme,
  markdownDefaultStyle,
} from "../dist/ui/theme-dracula.js";
import { createHeader, createStatusFooter } from "../dist/ui/header.js";

const sampleMd = `# Syntax & blocks

Elegant Pi / Codex-style chrome for agent replies.

- Pink **headings** with clearer hierarchy
- Fenced code with Dracula tokens
- Visible quote borders

\`\`\`typescript
const greet = (name: string): string => {
  // Dracula-ish highlight
  return \`hello, \${name}\`;
};
console.log(greet("paseo"));
\`\`\`

\`\`\`bash
ls -la /workspace/paseo-tui
\`\`\`

\`\`\`javascript
const n = 42;
if (n > 0) console.log("ok");
\`\`\`

> Soft quote with a stronger purple border —
> still muted enough for Ghostty transparency.
`;

const terminal = new ProcessTerminal();
const tui = new TuiAltScreen(terminal);

const timeline = new Container();
timeline.addChild(
  new Text(
    styleSystem(
      "paseo-tui 0.2.4 — Markdown + tool block demo (Ghostty transparent)",
    ),
    0,
    0,
  ),
);
timeline.addChild(new Spacer(1));
timeline.addChild(new Text(styleUser("Show me the new code chrome"), 0, 0));
timeline.addChild(new Spacer(1));

const agentWrap = new Container();
agentWrap.addChild(new Text(labelAgent(), 0, 0));
agentWrap.addChild(
  new Markdown(sampleMd, 0, 0, markdownTheme, markdownDefaultStyle),
);
timeline.addChild(agentWrap);
timeline.addChild(new Spacer(1));
timeline.addChild(
  new Text(
    styleToolBlock("Bash [running]\nls -la /workspace/paseo-tui"),
    0,
    0,
  ),
);
timeline.addChild(new Spacer(1));
timeline.addChild(
  new Text(
    styleToolBlock("Read [completed]\nsrc/ui/theme-dracula.ts"),
    0,
    0,
  ),
);

const header = createHeader();
header.setChips?.({
  model: "grok-gateway/grok-4.5",
  think: "high",
  agentId: "demo0240",
  conn: "connected",
});
// HeaderBar API
if (typeof header.setChips === "function") {
  header.setChips({
    model: "grok-gateway/grok-4.5",
    think: "high",
    agentId: "demo0240abcd",
    conn: "connected",
  });
}

const editor = new Editor(tui, editorTheme);
const editorAndFooter = new VStack([
  editor,
  createStatusFooter(
    ansi.fg.comment("conn:connected · bound") +
      "  " +
      ansi.fg.cyan("model:grok-4.5"),
  ),
]);

if (isViewportTUI(tui)) {
  tui.setLayoutRoot(
    new VStack([
      { component: header, basis: "auto", shrink: 0, minSize: 1 },
      {
        component: new ScrollView(timeline, {
          follow: "end",
          primary: true,
          overscroll: "chain",
          scrollbar: "auto",
        }),
        basis: 0,
        grow: 1,
        minSize: 1,
      },
      {
        component: editorAndFooter,
        basis: "auto",
        shrink: 1,
        minSize: 1,
      },
    ]),
  );
}

tui.start();
await new Promise((r) => setTimeout(r, 120_000));
process.exit(0);
