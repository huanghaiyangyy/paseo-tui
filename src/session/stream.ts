import type {
  PaseoAgent,
  PaseoAgentStream,
  PaseoAgentUpdate,
} from "@getpaseo/client";
import type { AgentPermissionRequest } from "@getpaseo/protocol/agent-types";
import type { TimelineAppender } from "../commands/types.js";
import { formatToolCallText, toolCallId } from "./tool-format.js";

export { formatToolInputPreview, formatToolCallText } from "./tool-format.js";
export { mergeStreamText } from "./merge-text.js";

function has(t: TimelineAppender, key: keyof TimelineAppender): boolean {
  return typeof (t as Record<string, unknown>)[key as string] === "function";
}

export function formatPermissionBrief(req: AgentPermissionRequest): string {
  const title = req.title?.trim() || req.name;
  const kind = req.kind ? ` (${req.kind})` : "";
  const desc = req.description?.trim() ? `\n  ${req.description.trim()}` : "";
  return `${title}${kind}  id=${req.id}${desc}\n  Use /allow or /deny${req.actions?.length ? " (or /allow <actionId>)" : ""}.`;
}

function printPermission(timeline: TimelineAppender, req: AgentPermissionRequest): void {
  const line = formatPermissionBrief(req);
  if (has(timeline, "appendPermission") && timeline.appendPermission) {
    timeline.appendPermission(line);
  } else {
    timeline.appendSystem(`permission › ${line}`);
  }
}

function emitTool(
  timeline: TimelineAppender,
  item: Record<string, unknown>,
): void {
  const status = typeof item.status === "string" ? item.status : "?";
  const text = formatToolCallText(item);
  const callId = toolCallId(item);

  const failed = status === "failed" || status === "error" || status === "errored";
  const completed =
    status === "completed" ||
    status === "success" ||
    status === "succeeded" ||
    status === "done" ||
    status === "canceled";

  if (
    (failed || completed) &&
    has(timeline, "appendToolResult") &&
    timeline.appendToolResult
  ) {
    timeline.appendToolResult(text, !failed, callId);
    return;
  }

  if (has(timeline, "appendTool") && timeline.appendTool) {
    timeline.appendTool(text, callId);
  } else {
    timeline.appendSystem(`tool › ${text}`);
  }
}

export type HandleTimelineItemOptions = {
  /** History snapshots: render assistant as finished Markdown, not a live delta. */
  snapshot?: boolean;
};

/** Apply one timeline item (live stream or projected history). */
export function handleTimelineItem(
  timeline: TimelineAppender,
  item: Record<string, unknown>,
  options?: HandleTimelineItemOptions,
): void {
  if (!item || typeof item.type !== "string") return;
  const snapshot = options?.snapshot === true;

  switch (item.type) {
    case "user_message": {
      const text = typeof item.text === "string" ? item.text : "";
      const begin = timeline as {
        wasLocalUserEcho?: (t: string) => boolean;
      };
      if (begin.wasLocalUserEcho?.(text)) return;
      timeline.appendUser(text);
      break;
    }
    case "assistant_message": {
      const text = typeof item.text === "string" ? item.text : "";
      const messageId =
        typeof item.messageId === "string" ? item.messageId : undefined;
      if (snapshot) {
        timeline.appendAgent(text, messageId);
        break;
      }
      if (has(timeline, "appendAgentDelta") && timeline.appendAgentDelta) {
        timeline.appendAgentDelta(text, messageId);
      } else {
        timeline.appendAgent(text, messageId);
      }
      break;
    }
    case "reasoning": {
      const text = typeof item.text === "string" ? item.text : "";
      if (has(timeline, "appendReasoning") && timeline.appendReasoning) {
        timeline.appendReasoning(text);
      } else {
        timeline.appendSystem(`think › ${text}`);
      }
      break;
    }
    case "tool_call": {
      emitTool(timeline, item);
      break;
    }
    case "error": {
      const message =
        typeof item.message === "string" ? item.message : "unknown error";
      timeline.appendError(message);
      break;
    }
    case "todo": {
      const items = Array.isArray(item.items) ? item.items : [];
      const done = items.filter((row) => {
        if (!row || typeof row !== "object") return false;
        return (row as { completed?: unknown }).completed === true;
      }).length;
      timeline.appendSystem(
        items.length ? `todo ${done}/${items.length}` : "todo list updated",
      );
      break;
    }
    case "compaction": {
      const status = typeof item.status === "string" ? item.status : "";
      timeline.appendSystem(`compaction ${status}`.trim());
      break;
    }
    default:
      break;
  }
}

/** Apply a daemon agent_stream payload to the timeline. */
export function handleAgentStream(
  timeline: TimelineAppender,
  payload: PaseoAgentStream,
  onPermission?: (req: AgentPermissionRequest) => void,
): void {
  const event = (payload as { event: Record<string, unknown> }).event;
  if (!event || typeof event.type !== "string") return;

  switch (event.type) {
    case "timeline": {
      const item = event.item as Record<string, unknown> | undefined;
      if (!item) return;
      handleTimelineItem(timeline, item);
      break;
    }
    case "permission_requested": {
      const request = event.request as AgentPermissionRequest | undefined;
      if (request) {
        onPermission?.(request);
        printPermission(timeline, request);
      }
      break;
    }
    case "permission_resolved": {
      const resolution = event.resolution as { behavior?: string } | undefined;
      const behavior = resolution?.behavior ?? "?";
      const requestId =
        typeof event.requestId === "string" ? event.requestId : "";
      timeline.appendSystem(`permission ${requestId} → ${behavior}`.trim());
      break;
    }
    case "turn_started":
      timeline.appendSystem("turn started…");
      break;
    case "turn_completed":
      timeline.finalizeAgentStream?.();
      timeline.appendSystem("turn completed");
      break;
    case "turn_failed":
      timeline.finalizeAgentStream?.();
      timeline.appendError(
        typeof event.error === "string" ? event.error : "turn failed",
      );
      break;
    case "turn_canceled":
      timeline.finalizeAgentStream?.();
      timeline.appendSystem(
        `turn canceled: ${typeof event.reason === "string" ? event.reason : ""}`.trim(),
      );
      break;
    case "thinking_option_changed":
      timeline.appendSystem(
        `thinking option → ${event.thinkingOptionId == null ? "(none)" : String(event.thinkingOptionId)}`,
      );
      break;
    case "attention_required":
      if (event.reason === "permission") {
        timeline.appendSystem(
          "attention: permission required — /allow or /deny",
        );
      }
      break;
    default:
      break;
  }
}

/**
 * Surface agent_update snapshots. Permissions are announced only when
 * `shouldAnnounce` returns true (caller tracks seen ids to avoid duplicates).
 */
export function handleAgentUpdate(
  timeline: TimelineAppender,
  update: PaseoAgentUpdate,
  options?: {
    onPermissions?: (reqs: AgentPermissionRequest[]) => void;
    shouldAnnouncePermission?: (req: AgentPermissionRequest) => boolean;
    onSnapshot?: (agent: PaseoAgent) => void;
  },
): void {
  if (!update || typeof update !== "object") return;
  if (update.kind === "remove") {
    timeline.appendSystem(`agent removed: ${update.agentId}`);
    return;
  }
  if (update.kind !== "upsert") return;
  const agent = update.agent;
  options?.onSnapshot?.(agent);
  if (agent.lastError) {
    timeline.appendError(String(agent.lastError));
  }
  const pending = (agent.pendingPermissions ?? []) as AgentPermissionRequest[];
  if (pending.length > 0) {
    options?.onPermissions?.(pending);
    for (const req of pending) {
      if (options?.shouldAnnouncePermission?.(req) ?? true) {
        printPermission(timeline, req);
      }
    }
  }
}
