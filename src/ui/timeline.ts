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
  styleReasoning,
  styleSystem,
  styleTool,
  styleUser,
} from "./theme-dracula.js";
import type { TimelineAppender } from "../commands/types.js";

type GroupRole = "user" | "agent" | "other";

type AgentStreamSlot = {
  wrap: Container;
  body: Text | Markdown;
  raw: string;
  messageId: string | null;
  isMarkdown: boolean;
};

export class TimelineView implements TimelineAppender {
  readonly container = new Container();
  private requestRenderFn: () => void = () => {};
  private agentStream: AgentStreamSlot | null = null;
  private lastLocalUserText: string | null = null;
  private streamedAssistantThisTurn = false;
  private lastGroupRole: GroupRole | null = null;

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
    this.requestRender();
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
   * Mid-stream uses Text; call finalizeAgentStream() when the turn settles.
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
      slot.body.setText(text);
      this.requestRender();
      return;
    }

    this.finalizeAgentStream();
    this.noteGroup("agent");
    const wrap = this.buildAgentBlock(text, false);
    const body = wrap.children[1] as Text;
    this.agentStream = {
      wrap,
      body,
      raw: text,
      messageId: messageId ?? null,
      isMarkdown: false,
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
    this.container.addChild(new Text(styleTool(text), 0, 0));
    this.requestRender();
  }

  appendReasoning(text: string): void {
    this.noteGroup("other");
    this.container.addChild(new Text(styleReasoning(text), 0, 0));
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
