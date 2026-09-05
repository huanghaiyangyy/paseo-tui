import {
  Container,
  Markdown,
  Spacer,
  Text,
  type Component,
} from "@earendil-works/pi-tui";
import {
  labelAgent,
  markdownDefaultStyle,
  markdownTheme,
  styleError,
  styleOk,
  stylePermission,
  styleSystem,
  styleThinkCollapsed,
  styleThinkExpanded,
  styleToolBlock,
  styleToolCollapsed,
  styleToolResult,
  styleUser,
} from "./theme-dracula.js";
import {
  hasCompleteFenceBlocks,
  shouldAutoCollapseThink,
  shouldAutoCollapseTool,
} from "./collapse.js";
import type { TimelineAppender } from "../commands/types.js";

type GroupRole = "user" | "agent" | "other";

type AgentStreamSlot = {
  wrap: Container;
  body: Text | Markdown;
  raw: string;
  messageId: string | null;
  isMarkdown: boolean;
};

type CollapsibleKind = "tool" | "think";

type CollapsibleSlot = {
  kind: CollapsibleKind;
  body: Text;
  raw: string;
  expanded: boolean;
};

export class TimelineView implements TimelineAppender {
  readonly container = new Container();
  private requestRenderFn: () => void = () => {};
  private agentStream: AgentStreamSlot | null = null;
  private lastLocalUserText: string | null = null;
  private streamedAssistantThisTurn = false;
  private lastGroupRole: GroupRole | null = null;
  private collapsibles: CollapsibleSlot[] = [];

  setRequestRender(fn: () => void): void {
    this.requestRenderFn = fn;
  }

  requestRender(): void {
    this.requestRenderFn();
  }

  clear(): void {
    this.container.clear();
    this.agentStream = null;
    this.lastLocalUserText = null;
    this.streamedAssistantThisTurn = false;
    this.lastGroupRole = null;
    this.collapsibles = [];
    this.requestRender();
  }

  /** Mark the start of a locally submitted turn (for de-duplicating stream echo). */
  beginLocalTurn(userText: string): void {
    this.lastLocalUserText = userText;
    this.streamedAssistantThisTurn = false;
    this.finalizeAgentStream();
    this.agentStream = null;
  }

  didStreamAssistantThisTurn(): boolean {
    return this.streamedAssistantThisTurn;
  }

  wasLocalUserEcho(text: string): boolean {
    return this.lastLocalUserText != null && this.lastLocalUserText === text;
  }

  /**
   * Promote in-flight Text body to Markdown once the stream settles.
   * Safe to call multiple times / when no stream is active.
   */
  finalizeAgentStream(): void {
    const slot = this.agentStream;
    if (!slot || slot.isMarkdown) return;
    this.promoteAgentToMarkdown(slot);
  }

  /** True when any tool block is currently collapsed (footer hint). */
  hasCollapsedTools(): boolean {
    return this.collapsibles.some((s) => s.kind === "tool" && !s.expanded);
  }

  hasCollapsedThinks(): boolean {
    return this.collapsibles.some((s) => s.kind === "think" && !s.expanded);
  }

  /** Expand the most recent collapsed tool; returns whether anything changed. */
  expandLastTool(): boolean {
    for (let i = this.collapsibles.length - 1; i >= 0; i--) {
      const s = this.collapsibles[i];
      if (s.kind === "tool" && !s.expanded) {
        s.expanded = true;
        s.body.setText(styleToolBlock(s.raw));
        this.requestRender();
        return true;
      }
    }
    // If last tool is already expanded, still report false.
    return false;
  }

  /** Collapse the most recent expanded tool (or last tool). */
  collapseLastTool(): boolean {
    for (let i = this.collapsibles.length - 1; i >= 0; i--) {
      const s = this.collapsibles[i];
      if (s.kind === "tool" && s.expanded) {
        s.expanded = false;
        s.body.setText(styleToolCollapsed(s.raw));
        this.requestRender();
        return true;
      }
    }
    // Force-collapse last tool even if already collapsed? no-op
    return false;
  }

  expandLastThink(): boolean {
    for (let i = this.collapsibles.length - 1; i >= 0; i--) {
      const s = this.collapsibles[i];
      if (s.kind === "think" && !s.expanded) {
        s.expanded = true;
        s.body.setText(styleThinkExpanded(s.raw));
        this.requestRender();
        return true;
      }
    }
    return false;
  }

  collapseLastThink(): boolean {
    for (let i = this.collapsibles.length - 1; i >= 0; i--) {
      const s = this.collapsibles[i];
      if (s.kind === "think" && s.expanded) {
        s.expanded = false;
        s.body.setText(styleThinkCollapsed(s.raw));
        this.requestRender();
        return true;
      }
    }
    return false;
  }

  appendSystem(text: string): void {
    this.noteGroup("other");
    this.container.addChild(new Text(styleSystem(text), 0, 0));
    this.requestRender();
  }

  appendUser(text: string): void {
    this.finalizeAgentStream();
    this.noteGroup("user");
    this.container.addChild(new Text(styleUser(text), 0, 0));
    this.requestRender();
  }

  appendAgent(text: string): void {
    this.finalizeAgentStream();
    this.agentStream = null;
    this.noteGroup("agent");
    this.container.addChild(this.buildAgentBlock(text, true));
    this.requestRender();
  }

  /**
   * Append or update streaming assistant text. Same messageId (or continued
   * growth without id) updates in place so deltas feel live.
   * Mid-stream starts as Text; promotes to Markdown early when fenced blocks
   * look complete (pi-tui 0.85 has no createHighlightStream).
   */
  appendAgentDelta(text: string, messageId?: string): void {
    this.streamedAssistantThisTurn = true;
    const slot = this.agentStream;
    if (
      slot &&
      ((messageId && messageId === slot.messageId) ||
        (!messageId &&
          !slot.messageId &&
          text.startsWith(slot.raw)))
    ) {
      slot.raw = text;
      if (!slot.isMarkdown && hasCompleteFenceBlocks(text)) {
        this.promoteAgentToMarkdown(slot);
      } else {
        slot.body.setText(text);
      }
      this.requestRender();
      return;
    }

    this.finalizeAgentStream();
    this.noteGroup("agent");
    const asMd = hasCompleteFenceBlocks(text);
    const wrap = this.buildAgentBlock(text, asMd);
    const body = wrap.children[1] as Text | Markdown;
    this.agentStream = {
      wrap,
      body,
      raw: text,
      messageId: messageId ?? null,
      isMarkdown: asMd,
    };
    this.container.addChild(wrap);
    this.requestRender();
  }

  appendError(text: string): void {
    this.noteGroup("other");
    this.container.addChild(new Text(styleError(text), 0, 0));
    this.requestRender();
  }

  appendOk(text: string): void {
    this.noteGroup("other");
    this.container.addChild(new Text(styleOk(text), 0, 0));
    this.requestRender();
  }

  appendTool(text: string): void {
    this.noteGroup("other");
    const expanded = !shouldAutoCollapseTool(text);
    const painted = expanded
      ? styleToolBlock(text)
      : styleToolCollapsed(text);
    const body = new Text(painted, 0, 0);
    this.collapsibles.push({
      kind: "tool",
      body,
      raw: text,
      expanded,
    });
    this.container.addChild(body);
    this.requestRender();
  }

  /** Best-effort success/fail tool result chrome when the stream provides it. */
  appendToolResult(text: string, ok = true): void {
    this.noteGroup("other");
    // Prefer collapsed summary for long result bodies; keep box when short.
    const expanded = !shouldAutoCollapseTool(text);
    const painted = expanded
      ? styleToolResult(text, ok)
      : styleToolCollapsed(
          text.includes("[")
            ? text
            : `${text.split("\n")[0]} [${ok ? "completed" : "failed"}]\n${text.split("\n").slice(1).join("\n")}`.trim(),
        );
    const raw = text.includes("[")
      ? text
      : `${text.split("\n")[0]} [${ok ? "completed" : "failed"}]\n${text.split("\n").slice(1).join("\n")}`.trim();
    const body = new Text(painted, 0, 0);
    this.collapsibles.push({
      kind: "tool",
      body,
      raw,
      expanded,
    });
    this.container.addChild(body);
    this.requestRender();
  }

  appendReasoning(text: string): void {
    this.noteGroup("other");
    const expanded = !shouldAutoCollapseThink(text);
    const painted = expanded
      ? styleThinkExpanded(text)
      : styleThinkCollapsed(text);
    const body = new Text(painted, 0, 0);
    this.collapsibles.push({
      kind: "think",
      body,
      raw: text,
      expanded,
    });
    this.container.addChild(body);
    this.requestRender();
  }

  appendPermission(text: string): void {
    this.noteGroup("other");
    this.container.addChild(new Text(stylePermission(text), 0, 0));
    this.requestRender();
  }

  /** Thin spacer between user/agent turn groups. */
  private noteGroup(role: GroupRole): void {
    if (
      this.lastGroupRole != null &&
      (role === "user" || role === "agent") &&
      this.lastGroupRole !== role &&
      (this.lastGroupRole === "user" || this.lastGroupRole === "agent")
    ) {
      this.container.addChild(new Spacer(1));
    } else if (
      this.lastGroupRole != null &&
      (role === "user" || role === "agent") &&
      this.lastGroupRole === "other"
    ) {
      // Soft breathe before a new turn after system/tool noise.
      this.container.addChild(new Spacer(1));
    }
    if (role === "user" || role === "agent") {
      this.lastGroupRole = role;
    } else if (this.lastGroupRole == null) {
      this.lastGroupRole = "other";
    }
  }

  private promoteAgentToMarkdown(slot: AgentStreamSlot): void {
    if (slot.isMarkdown) {
      slot.body.setText(slot.raw);
      return;
    }
    const md = new Markdown(
      slot.raw,
      0,
      0,
      markdownTheme,
      markdownDefaultStyle,
    );
    slot.wrap.removeChild(slot.body);
    slot.wrap.addChild(md);
    slot.body = md;
    slot.isMarkdown = true;
  }

  private buildAgentBlock(text: string, asMarkdown: boolean): Container {
    const wrap = new Container();
    wrap.addChild(new Text(labelAgent(), 0, 0));
    const body: Component = asMarkdown
      ? new Markdown(text, 0, 0, markdownTheme, markdownDefaultStyle)
      : new Text(text, 0, 0);
    wrap.addChild(body);
    return wrap;
  }
}
