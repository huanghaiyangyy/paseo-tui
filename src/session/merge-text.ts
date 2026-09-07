/**
 * Merge a live timeline chunk into accumulated text.
 *
 * Daemon `agent_stream` timeline items are typically **deltas** (new tokens
 * only). History fetch with `projection: "projected"` concatenates those
 * deltas. Some providers instead send **snapshots** (full text so far).
 *
 * `catchup` is used when flushing events that raced a history fetch: skip
 * chunks already present in the hydrated snapshot.
 */

export type StreamMergeMode = "live" | "catchup";

export function mergeStreamText(
  current: string,
  incoming: string,
  mode: StreamMergeMode = "live",
): string {
  if (!incoming) return current;
  if (!current) return incoming;
  if (incoming === current) return current;
  // Accumulated / snapshot form grew (or equal prefix).
  if (incoming.startsWith(current)) return incoming;
  // Stale shorter snapshot.
  if (current.startsWith(incoming)) return current;
  if (mode === "catchup") {
    // Duplicate delta already inside the hydrated snapshot.
    if (incoming.length >= 4 && current.endsWith(incoming)) return current;
    if (incoming.length >= 12 && current.includes(incoming)) return current;
  }
  return current + incoming;
}
