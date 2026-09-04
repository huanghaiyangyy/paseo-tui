import { Container, Text } from "@earendil-works/pi-tui";
import {
  styleAgent,
  styleError,
  styleOk,
  stylePermission,
  styleReasoning,
  styleSystem,
  styleTool,
  styleUser,
} from "./theme-dracula.js";
import type { TimelineAppender } from "../commands/types.js";

export class TimelineView implements TimelineAppender {
  readonly container = new Container();
  private requestRenderFn: () => void = () => {};
  private agentStreamText: Text | null = null;
  private agentStreamMessageId: string | null = null;
  private agentStreamRaw = "";
  private lastLocalUserText: string | null = null;
  private streamedAssistantThisTurn = false;

  setRequestRender(fn: () => void): void {
    this.requestRenderFn = fn;
  }

  requestRender(): void {
    this.requestRenderFn();
  }

  clear(): void {
    this.container.clear();
    this.agentStreamText = null;
    this.agentStreamMessageId = null;
    this.agentStreamRaw = "";
    this.lastLocalUserText = null;
    this.streamedAssistantThisTurn = false;
    this.requestRender();
  }

  /** Mark the start of a locally submitted turn (for de-duplicating stream echo). */
  beginLocalTurn(userText: string): void {
    this.lastLocalUserText = userText;
    this.streamedAssistantThisTurn = false;
    this.agentStreamText = null;
    this.agentStreamMessageId = null;
    this.agentStreamRaw = "";
  }

  didStreamAssistantThisTurn(): boolean {
    return this.streamedAssistantThisTurn;
  }

  wasLocalUserEcho(text: string): boolean {
    return this.lastLocalUserText != null && this.lastLocalUserText === text;
  }

  appendSystem(text: string): void {
    this.container.addChild(new Text(styleSystem(text), 1, 0));
    this.requestRender();
  }

  appendUser(text: string): void {
    this.container.addChild(new Text(styleUser(text), 1, 0));
    this.requestRender();
  }

  appendAgent(text: string): void {
    this.agentStreamText = null;
    this.agentStreamMessageId = null;
    this.agentStreamRaw = "";
    this.container.addChild(new Text(styleAgent(text), 1, 0));
    this.requestRender();
  }

  /**
   * Append or update streaming assistant text. Same messageId (or continued
   * growth without id) updates in place so deltas feel live.
   */
  appendAgentDelta(text: string, messageId?: string): void {
    this.streamedAssistantThisTurn = true;
    if (
      this.agentStreamText &&
      ((messageId && messageId === this.agentStreamMessageId) ||
        (!messageId && !this.agentStreamMessageId && text.startsWith(this.agentStreamRaw)))
    ) {
      this.agentStreamRaw = text;
      this.agentStreamText.setText(styleAgent(text));
      this.requestRender();
      return;
    }
    this.agentStreamRaw = text;
    this.agentStreamMessageId = messageId ?? null;
    this.agentStreamText = new Text(styleAgent(text), 1, 0);
    this.container.addChild(this.agentStreamText);
    this.requestRender();
  }

  appendError(text: string): void {
    this.container.addChild(new Text(styleError(text), 1, 0));
    this.requestRender();
  }

  appendOk(text: string): void {
    this.container.addChild(new Text(styleOk(text), 1, 0));
    this.requestRender();
  }

  appendTool(text: string): void {
    this.container.addChild(new Text(styleTool(text), 1, 0));
    this.requestRender();
  }

  appendReasoning(text: string): void {
    this.container.addChild(new Text(styleReasoning(text), 1, 0));
    this.requestRender();
  }

  appendPermission(text: string): void {
    this.container.addChild(new Text(stylePermission(text), 1, 0));
    this.requestRender();
  }
}
