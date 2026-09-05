import type { PaseoAgentStream, PaseoAgentUpdate } from "@getpaseo/client";
import type { AgentPermissionRequest } from "@getpaseo/protocol/agent-types";
import type { TimelineAppender } from "../commands/types.js";

function has(t: TimelineAppender, key: keyof TimelineAppender): boolean {
  return typeof (t as Record<string, unknown>)[key as string] === "function";
}

function summarizeTool(item: {
  name: string;
  status: string;
  error?: unknown;
}): string {
  const err =
    item.status === "failed" && item.error != null
      ? ` — ${typeof item.error === "string" ? item.error : JSON.stringify(item.error)}`
      : "";
  return `${item.name} [${item.status}]${err}`;
}

/** Best-effort preview of tool input for the bordered tool body. */
export function formatToolInputPreview(detail: unknown): string | null {
  if (detail == null || typeof detail !== "object") return null;
  const d = detail as Record<string, unknown>;
  const input = d.input;
  if (input == null) return null;
  if (typeof input === "string") {
    const t = input.trim();
    return t.length ? t : null;
  }
  if (typeof input !== "object") {
    return String(input);
  }
  const obj = input as Record<string, unknown>;
  for (const key of [
    "command",
    "cmd",
    "script",
    "code",
    "query",
    "path",
    "file",
    "pattern",
    "url",
    "text",
    "content",
  ]) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) {
      return v.trim();
    }
  }
  try {
    const json = JSON.stringify(obj);
    if (!json || json === "{}") return null;
    return json.length > 160 ? json.slice(0, 157) + "…" : json;
  } catch {
    return null;
  }
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
  const name = typeof item.name === "string" ? item.name : "tool";
  const status = typeof item.status === "string" ? item.status : "?";
  const header = summarizeTool({
    name,
    status,
    error: item.error,
  });
  const preview = formatToolInputPreview(item.detail);
  const text = preview ? `${header}\n${preview}` : header;

  const failed = status === "failed" || status === "error" || status === "errored";
  const completed =
    status === "completed" ||
    status === "success" ||
    status === "succeeded" ||
    status === "done";

  if (
    (failed || completed) &&
    has(timeline, "appendToolResult") &&
    timeline.appendToolResult
  ) {
    timeline.appendToolResult(text, !failed);
    return;
  }

  if (has(timeline, "appendTool") && timeline.appendTool) {
    timeline.appendTool(text);
  } else {
    timeline.appendSystem(`tool › ${text}`);
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
      if (!item || typeof item.type !== "string") return;
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
          if (has(timeline, "appendAgentDelta") && timeline.appendAgentDelta) {
            timeline.appendAgentDelta(text, messageId);
          } else {
            timeline.appendAgent(text);
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
        case "todo":
          timeline.appendSystem("todo list updated");
          break;
        case "compaction": {
          const status = typeof item.status === "string" ? item.status : "";
          timeline.appendSystem(`compaction ${status}`.trim());
          break;
        }
        default:
          break;
      }
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
      timeline.appendSystem("turn completed");
      break;
    case "turn_failed":
      timeline.appendError(
        typeof event.error === "string" ? event.error : "turn failed",
      );
      break;
    case "turn_canceled":
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
  },
): void {
  if (!update || typeof update !== "object") return;
  if (update.kind === "remove") {
    timeline.appendSystem(`agent removed: ${update.agentId}`);
    return;
  }
  if (update.kind !== "upsert") return;
  const agent = update.agent;
  if (agent.lastError) {
    timeline.appendError(String(agent.lastError));
  }
  if (typeof agent.status === "string") {
    timeline.appendSystem(`status → ${agent.status}`);
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
