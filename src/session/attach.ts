import type { PaseoAgentHandle } from "@getpaseo/client";
import type { AgentPermissionRequest } from "@getpaseo/protocol/agent-types";
import type { CommandContext } from "../commands/types.js";
import { handleAgentStream, handleAgentUpdate } from "./stream.js";

/** Detach local subscriptions and clear agent binding (does not call daemon.detach). */
export function clearAgentBinding(ctx: CommandContext): void {
  try {
    ctx.state.unsubscribeUpdate?.();
  } catch {
    // ignore
  }
  try {
    ctx.state.unsubscribeStream?.();
  } catch {
    // ignore
  }
  ctx.state.unsubscribeUpdate = null;
  ctx.state.unsubscribeStream = null;
  ctx.state.agent = null;
  ctx.state.agentId = null;
  ctx.state.pendingPermissions = [];
  ctx.state.seenPermissionIds.clear();
}

function trackPermissions(
  ctx: CommandContext,
  reqs: AgentPermissionRequest[],
): void {
  for (const req of reqs) {
    if (!ctx.state.pendingPermissions.some((p) => p.id === req.id)) {
      ctx.state.pendingPermissions.push(req);
    }
  }
}

function markSeen(ctx: CommandContext, req: AgentPermissionRequest): boolean {
  if (ctx.state.seenPermissionIds.has(req.id)) return false;
  ctx.state.seenPermissionIds.add(req.id);
  return true;
}

/**
 * Bind a live agent handle: unsubscribe previous, subscribe to agent + timeline
 * streams, and request selective timeline delivery when the daemon supports it.
 */
export async function attachAgent(
  ctx: CommandContext,
  agent: PaseoAgentHandle,
): Promise<void> {
  clearAgentBinding(ctx);

  ctx.state.agent = agent;
  ctx.state.agentId = agent.id;

  const snap = agent.current();
  if (snap) {
    ctx.state.model = snap.model
      ? `${snap.provider}/${snap.model}`
      : snap.provider;
    if (snap.thinkingOptionId) {
      ctx.state.thinkLevel = snap.thinkingOptionId;
    }
    const pending = (snap.pendingPermissions ?? []) as AgentPermissionRequest[];
    if (pending.length > 0) {
      trackPermissions(ctx, pending);
      for (const req of pending) {
        markSeen(ctx, req);
      }
    }
  }

  if (ctx.state.daemon) {
    try {
      await ctx.state.daemon.setAgentTimelineSubscription([agent.id]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.timeline.appendSystem(
        `Timeline subscription RPC unavailable (best-effort): ${message}`,
      );
    }
  }

  ctx.state.unsubscribeUpdate = agent.subscribe((update) => {
    handleAgentUpdate(ctx.timeline, update, {
      onPermissions: (reqs) => trackPermissions(ctx, reqs),
      shouldAnnouncePermission: (req) => markSeen(ctx, req),
    });
    ctx.setStatus(ctx.statusLine());
  });

  ctx.state.unsubscribeStream = agent.timeline.subscribe((payload) => {
    handleAgentStream(ctx.timeline, payload, (req) => {
      trackPermissions(ctx, [req]);
      markSeen(ctx, req);
    });
    ctx.setStatus(ctx.statusLine());
  });

  ctx.setStatus(ctx.statusLine());
}

export function takePendingPermission(
  ctx: CommandContext,
  requestId?: string,
): AgentPermissionRequest | null {
  const list = ctx.state.pendingPermissions;
  if (list.length === 0) return null;
  if (requestId) {
    const idx = list.findIndex((p) => p.id === requestId);
    if (idx === -1) return null;
    const [req] = list.splice(idx, 1);
    return req ?? null;
  }
  return list.shift() ?? null;
}

export async function refreshPendingPermissions(
  ctx: CommandContext,
): Promise<AgentPermissionRequest[]> {
  if (!ctx.state.agent) return [];
  try {
    await ctx.state.agent.refresh();
  } catch {
    // best-effort
  }
  const pending = (ctx.state.agent.pendingPermissions ??
    []) as AgentPermissionRequest[];
  ctx.state.pendingPermissions = [...pending];
  return pending;
}
