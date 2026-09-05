#!/usr/bin/env node
/**
 * Demo: collapsed tool + think + highlighted code + usage footer (0.2.5 P0/P1).
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
  styleSystem,
  styleUser,
  styleToolBlock,
  styleToolCollapsed,
  styleThinkCollapsed,
  styleThinkExpanded,
  labelAgent,
  markdownTheme,
  markdownDefaultStyle,
} from "../dist/ui/theme-dracula.js";
import { HeaderBar, StatusFooter } from "../dist/ui/header.js";
import { formatUsageChips } from "../dist/ui/usage.js";

const sampleMd = `# P0 + P1

\`\`\`typescript
const n: number = 42; // mid-stream highlight
console.log(n);
\`\`\`
`;

const longThink =
  "Considering how to present collapsible tool output without losing the Codex box when the body is short. Long reasoning collapses to a one-liner with a /think-expand hint so the timeline stays scannable while still offering full context on demand.";

const terminal = new ProcessTerminal();
const tui = new TuiAltScreen(terminal);

const timeline = new Container();
timeline.addChild(
  new Text(
    styleSystem(
      "paseo-tui 0.2.5 — P0/P1 demo (tools · think · code · usage)",
    ),
    0,
    0,
  ),
);
timeline.addChild(new Spacer(1));
timeline.addChild(
  new Text(styleUser("Show collapsed tool + think + highlighted code"), 0, 0),
);
timeline.addChild(new Spacer(1));

timeline.addChild(new Text(styleThinkCollapsed(longThink), 0, 0));
timeline.addChild(new Spacer(1));
timeline.addChild(
  new Text(
    styleThinkExpanded("Short think stays open under 120 chars."),
    0,
    0,
  ),
);
timeline.addChild(new Spacer(1));

const agentWrap = new Container();
agentWrap.addChild(new Text(labelAgent(), 0, 0));
agentWrap.addChild(
  new Markdown(sampleMd, 0, 0, markdownTheme, markdownDefaultStyle),
);
timeline.addChild(agentWrap);
timeline.addChild(new Spacer(1));

timeline.addChild(new Text(styleToolBlock("Bash [completed]\nls -la"), 0, 0));
timeline.addChild(new Spacer(1));

timeline.addChild(
  new Text(
    styleToolCollapsed(
      "Bash [running]\nfind /workspace/paseo-tui/src -name '*.ts'\nhead -n 5 package.json\ncat CHANGELOG.md | head",
    ),
    0,
    0,
  ),
);
timeline.addChild(new Spacer(1));
timeline.addChild(
  new Text(
    styleSystem("tip · /expand  /collapse  /think-expand  /thinking  /help"),
    0,
    0,
  ),
);

const header = new HeaderBar("paseo-tui");
header.setChips({
  model: "grok-gateway/grok-4.5",
  think: "high",
  agentId: "demo0250abcd",
  conn: "connected",
  extra: "▾tools /expand",
});

const usage = formatUsageChips({
  inputTokens: 1840,
  outputTokens: 612,
  totalCostUsd: 0.018,
  contextWindowUsedTokens: 9200,
  contextWindowMaxTokens: 20000,
});

const footer = new StatusFooter({
  conn: "connected",
  bound: "demo0250",
  model: "grok-gateway/grok-4.5",
  think: "high",
  usage,
  extra: "▾tools /expand",
});

const editor = new Editor(tui, editorTheme);
const editorAndFooter = new VStack([editor, footer]);

if (isViewportTUI(tui)) {
  tui.setLayoutRoot(
    new VStack([
      { component: header, basis: "auto", shrink: 0, minSize: 2 },
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
await new Promise((r) => setTimeout(r, 180_000));
process.exit(0);
