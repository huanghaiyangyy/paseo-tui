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
  shouldAutoCollapseThink,
  shouldAutoCollapseTool,
} from "./collapse.js";
import type { TimelineAppender } from "../commands/types.js";
import {
  mergeStreamText,
  type StreamMergeMode,
} from "../session/merge-text.js";

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
  userExpanded: boolean;
  callId: string | null;
  /** null = running tool box; true/false = result chrome. */
  toolOk: boolean | null;
};

export class TimelineView implements TimelineAppender {
  readonly container = new Container();
  private requestRenderFn: () => void = () => {};
  private agentStream: AgentStreamSlot | null = null;
  private readonly agentByMessageId = new Map<string, AgentStreamSlot>();
  private lastLocalUserText: string | null = null;
  private streamedAssistantThisTurn = false;
  private lastGroupRole: GroupRole | null = null;
  private collapsibles: CollapsibleSlot[] = [];
  private thinkSlot: CollapsibleSlot | null = null;
  private readonly toolsByCallId = new Map<string, CollapsibleSlot>();
  private batchDepth = 0;
  private mergeMode: StreamMergeMode = "live";

  setRequestRender(fn: () => void): void {
    this.requestRenderFn = fn;
  }

  requestRender(): void {
    if (this.batchDepth > 0) return;
    this.requestRenderFn();
  }

  beginBatch(): void {
    this.batchDepth += 1;
  }

  endBatch(): void {
    this.batchDepth = Math.max(0, this.batchDepth - 1);
    if (this.batchDepth === 0) this.requestRenderFn();
  }

  setStreamMergeMode(mode: StreamMergeMode): void {
    this.mergeMode = mode;
  }

  clear(): void {
    this.container.clear();
    this.agentStream = null;
    this.agentByMessageId.clear();
    this.lastLocalUserText = null;
    this.streamedAssistantThisTurn = false;
    this.lastGroupRole = null;
    this.collapsibles = [];
    this.thinkSlot = null;
    this.toolsByCallId.clear();
    this.requestRender();
  }

  /** Mark the start of a locally submitted turn (for de-duplicating stream echo). */
  beginLocalTurn(userText: string): void {
    this.lastLocalUserText = userText;
    this.streamedAssistantThisTurn = false;
    this.closeThink();
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
        s.userExpanded = true;
        this.paintCollapsible(s);
        this.requestRender();
        return true;
      }
    }
    return false;
  }

  /** Collapse the most recent expanded tool (or last tool). */
  collapseLastTool(): boolean {
    for (let i = this.collapsibles.length - 1; i >= 0; i--) {
      const s = this.collapsibles[i];
      if (s.kind === "tool" && s.expanded) {
        s.expanded = false;
        s.userExpanded = false;
        this.paintCollapsible(s);
        this.requestRender();
        return true;
      }
    }
    return false;
  }

  expandLastThink(): boolean {
    for (let i = this.collapsibles.length - 1; i >= 0; i--) {
      const s = this.collapsibles[i];
      if (s.kind === "think" && !s.expanded) {
        s.expanded = true;
        s.userExpanded = true;
        this.paintCollapsible(s);
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
        s.userExpanded = false;
        this.paintCollapsible(s);
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
    this.closeThink();
    this.finalizeAgentStream();
    this.noteGroup("user");
    this.container.addChild(new Text(styleUser(text), 0, 0));
    this.requestRender();
  }

  appendAgent(text: string, messageId?: string): void {
    this.closeThink();
    this.finalizeAgentStream();
    this.agentStream = null;
    this.noteGroup("agent");
    const wrap = this.buildAgentBlock(text, true);
    const body = wrap.children[1] as Text | Markdown;
    const slot: AgentStreamSlot = {
      wrap,
      body,
      raw: text,
      messageId: messageId ?? null,
      isMarkdown: true,
    };
    if (messageId) this.agentByMessageId.set(messageId, slot);
    this.agentStream = slot;
    this.container.addChild(wrap);
    this.requestRender();
  }

  /**
   * Append or update streaming assistant text. Same messageId (or continued
   * unnamed stream) updates in place. Incoming chunks may be deltas or snapshots.
   * Stays as plain Text until finalizeAgentStream() so we don't re-parse Markdown
   * / highlight.js on every token.
   */
  appendAgentDelta(text: string, messageId?: string): void {
    this.streamedAssistantThisTurn = true;
    this.closeThink();
    const slot = this.findAgentSlot(messageId);
    if (slot) {
      const merged = mergeStreamText(slot.raw, text, this.mergeMode);
      if (merged !== slot.raw) {
        slot.raw = merged;
        slot.body.setText(merged);
      }
      this.agentStream = slot;
      this.requestRender();
      return;
    }

    this.finalizeAgentStream();
    this.noteGroup("agent");
    const wrap = this.buildAgentBlock(text, false);
    const body = wrap.children[1] as Text | Markdown;
    const created: AgentStreamSlot = {
      wrap,
      body,
      raw: text,
      messageId: messageId ?? null,
      isMarkdown: false,
    };
    if (messageId) this.agentByMessageId.set(messageId, created);
    this.agentStream = created;
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

  appendTool(text: string, callId?: string): void {
    this.upsertTool(text, callId, null);
  }

  /** Best-effort success/fail tool result chrome when the stream provides it. */
  appendToolResult(text: string, ok = true, callId?: string): void {
    this.upsertTool(text, callId, ok);
  }

  appendReasoning(text: string): void {
    this.noteGroup("other");
    if (this.thinkSlot) {
      const merged = mergeStreamText(this.thinkSlot.raw, text, this.mergeMode);
      if (merged === this.thinkSlot.raw) return;
      this.thinkSlot.raw = merged;
      if (!this.thinkSlot.userExpanded) {
        this.thinkSlot.expanded = !shouldAutoCollapseThink(merged);
      }
      this.paintCollapsible(this.thinkSlot);
      this.requestRender();
      return;
    }

    const expanded = !shouldAutoCollapseThink(text);
    const slot: CollapsibleSlot = {
      kind: "think",
      body: new Text("", 0, 0),
      raw: text,
      expanded,
      userExpanded: false,
      callId: null,
      toolOk: null,
    };
    this.paintCollapsible(slot);
    this.thinkSlot = slot;
    this.collapsibles.push(slot);
    this.container.addChild(slot.body);
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

  private findAgentSlot(messageId?: string): AgentStreamSlot | null {
    if (messageId) {
      return this.agentByMessageId.get(messageId) ?? null;
    }
    if (this.agentStream && !this.agentStream.messageId) {
      return this.agentStream;
    }
    return null;
  }

  private closeThink(): void {
    this.thinkSlot = null;
  }

  private upsertTool(
    text: string,
    callId: string | undefined,
    toolOk: boolean | null,
  ): void {
    this.closeThink();
    this.noteGroup("other");
    const existing = callId ? this.toolsByCallId.get(callId) : undefined;
    if (existing) {
      existing.raw = text;
      existing.toolOk = toolOk;
      if (!existing.userExpanded) {
        existing.expanded = !shouldAutoCollapseTool(text);
      }
      this.paintCollapsible(existing);
      this.requestRender();
      return;
    }

    const expanded = !shouldAutoCollapseTool(text);
    const slot: CollapsibleSlot = {
      kind: "tool",
      body: new Text("", 0, 0),
      raw: text,
      expanded,
      userExpanded: false,
      callId: callId ?? null,
      toolOk,
    };
    this.paintCollapsible(slot);
    if (callId) this.toolsByCallId.set(callId, slot);
    this.collapsibles.push(slot);
    this.container.addChild(slot.body);
    this.requestRender();
  }

  private paintCollapsible(slot: CollapsibleSlot): void {
    if (slot.kind === "think") {
      slot.body.setText(
        slot.expanded ? styleThinkExpanded(slot.raw) : styleThinkCollapsed(slot.raw),
      );
      return;
    }
    if (!slot.expanded) {
      slot.body.setText(styleToolCollapsed(slot.raw));
      return;
    }
    if (slot.toolOk == null) {
      slot.body.setText(styleToolBlock(slot.raw));
      return;
    }
    slot.body.setText(styleToolResult(slot.raw, slot.toolOk));
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
