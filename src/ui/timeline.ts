import { Container, Text } from "@earendil-works/pi-tui";
import {
  styleAgent,
  styleError,
  styleOk,
  styleSystem,
  styleUser,
} from "./theme-dracula.js";
import type { TimelineAppender } from "../commands/types.js";

export class TimelineView implements TimelineAppender {
  readonly container = new Container();
  private requestRenderFn: () => void = () => {};

  setRequestRender(fn: () => void): void {
    this.requestRenderFn = fn;
  }

  requestRender(): void {
    this.requestRenderFn();
  }

  clear(): void {
    this.container.clear();
    this.requestRender();
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
    this.container.addChild(new Text(styleAgent(text), 1, 0));
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
}
