import { buildToolCallDisplayModel } from "@getpaseo/protocol/tool-call-display";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";

const OUTPUT_MAX_CHARS = 4000;
const OUTPUT_MAX_LINES = 40;

const PREVIEW_KEYS = [
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
  "target_file",
  "file_path",
  "filePath",
  "glob",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clipOutput(text: string): string {
  const lines = text.split("\n");
  let clipped = text;
  if (lines.length > OUTPUT_MAX_LINES) {
    clipped = lines.slice(0, OUTPUT_MAX_LINES).join("\n") + "\n…";
  }
  if (clipped.length > OUTPUT_MAX_CHARS) {
    clipped = clipped.slice(0, OUTPUT_MAX_CHARS - 1) + "…";
  }
  return clipped;
}

function formatUnknownInput(input: unknown): string | null {
  if (input == null) return null;
  if (typeof input === "string") {
    const t = input.trim();
    return t.length ? t : null;
  }
  if (typeof input !== "object") return String(input);
  if (Array.isArray(input)) {
    try {
      const json = JSON.stringify(input);
      return json && json !== "[]" ? json : null;
    } catch {
      return null;
    }
  }
  const obj = input as Record<string, unknown>;
  for (const key of PREVIEW_KEYS) {
    const v = asString(obj[key]);
    if (v) return v;
  }
  const keys = Object.keys(obj);
  if (keys.length === 0) return null;
  try {
    const json = JSON.stringify(obj, null, keys.length <= 6 ? 2 : 0);
    if (!json || json === "{}") return null;
    return json.length > 2000 ? json.slice(0, 1997) + "…" : json;
  } catch {
    return null;
  }
}

function extractDetailPreview(detail: unknown): string | null {
  if (!isRecord(detail)) return null;
  switch (detail.type) {
    case "shell":
      return asString(detail.command);
    case "read":
    case "edit":
    case "write":
      return asString(detail.filePath);
    case "search":
      return asString(detail.query);
    case "fetch":
      return asString(detail.url);
    case "worktree_setup":
      return asString(detail.branchName);
    case "sub_agent":
      return asString(detail.description) ?? asString(detail.subAgentType);
    case "plain_text":
      return asString(detail.label) ?? asString(detail.text);
    case "plan":
      return asString(detail.text);
    case "unknown":
      return formatUnknownInput(detail.input);
    default:
      return (
        formatUnknownInput(detail.input) ??
        asString(detail.command) ??
        asString(detail.filePath) ??
        asString(detail.query) ??
        asString(detail.url)
      );
  }
}

function stringifyOutput(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t.length ? t : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    const json = JSON.stringify(value, null, 2);
    return json && json !== "{}" && json !== "[]" ? json : null;
  } catch {
    return null;
  }
}

function extractDetailOutput(detail: unknown): string | null {
  if (!isRecord(detail)) return null;
  switch (detail.type) {
    case "shell":
      return stringifyOutput(detail.output);
    case "read":
    case "search":
      return stringifyOutput(detail.content);
    case "edit":
      return stringifyOutput(detail.unifiedDiff);
    case "fetch":
      return stringifyOutput(detail.result);
    case "plain_text":
      return stringifyOutput(detail.text);
    case "plan":
      return stringifyOutput(detail.text);
    case "unknown":
      return stringifyOutput(detail.output);
    default:
      return stringifyOutput(detail.output);
  }
}

const TOOL_STATUSES = new Set(["running", "completed", "failed", "canceled"]);

/** Best-effort preview of tool input for the bordered tool body. */
export function formatToolInputPreview(detail: unknown): string | null {
  return extractDetailPreview(detail);
}

/** One timeline-ready tool block: header + input preview + clipped output. */
export function formatToolCallText(item: Record<string, unknown>): string {
  const name = typeof item.name === "string" && item.name.trim() ? item.name : "tool";
  const status = typeof item.status === "string" && item.status.trim() ? item.status : "?";
  let displayName = name;
  let summary: string | null = null;

  if (isRecord(item.detail) && typeof item.detail.type === "string" && TOOL_STATUSES.has(status)) {
    try {
      const model = buildToolCallDisplayModel({
        name,
        status: status as "running" | "completed" | "failed" | "canceled",
        error: item.error,
        metadata: isRecord(item.metadata) ? item.metadata : undefined,
        detail: item.detail as ToolCallDetail,
      });
      if (model.displayName) displayName = model.displayName;
      if (model.summary) summary = model.summary;
    } catch {
      // Unexpected detail discriminant — fall through to field extraction.
    }
  }

  const err =
    status === "failed" && item.error != null
      ? ` — ${typeof item.error === "string" ? item.error : JSON.stringify(item.error)}`
      : "";

  const title =
    isRecord(item.metadata) && typeof item.metadata.title === "string"
      ? item.metadata.title.trim()
      : "";

  const preview =
    summary ??
    extractDetailPreview(item.detail) ??
    formatUnknownInput(item.input) ??
    formatUnknownInput(item.arguments) ??
    (title.length ? title : null);

  const output = extractDetailOutput(item.detail);
  const lines = [`${displayName} [${status}]${err}`];
  if (preview) lines.push(preview);
  if (output) lines.push(clipOutput(output));
  return lines.join("\n");
}

export function toolCallId(item: Record<string, unknown>): string | undefined {
  return typeof item.callId === "string" && item.callId.length > 0
    ? item.callId
    : undefined;
}
