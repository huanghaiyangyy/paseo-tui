# Changelog

## 0.2.0 – 2026-09-04

### P1 — daily usability

- **Streaming timeline**: on bind/create/import, subscribe to `agent.timeline` + `agent.subscribe` (and `setAgentTimelineSubscription` when supported). Live user / assistant deltas / tool calls / reasoning / errors appear in the Dracula timeline while `run()` still submits prompts.
- **`/bind` SelectList**: no args opens an agent picker (same overlay UX as `/new`); with id still binds directly.
- **Permissions**: pending permission requests surface in the timeline; `/allow`, `/deny`, and `/perms` call `DaemonClient.respondToPermission` (best-effort refresh via `pendingPermissions`).
- **Default model**: `grok-gateway/grok-4.5` (override with `PASEO_PROVIDER` / `--provider`).

### P2 — behavior stability

- **Reconnect / errors**: clearer connect failure messages; auto-reconnect stays **disabled** for TUI sessions to avoid duplicate subscriptions; status footer shows `conn:..` state via `subscribeConnectionStatus`.
- **`/switch`**: pick another agent and rebind (unsubscribes previous timeline/update listeners first).
- **`/think` picker**: with no args and a bound agent, lists `thinkingOptions` from provider catalog / agent features and applies via `setAgentThinkingOption`. `/new` still passes the selected think level as `thinkingOptionId`.

### P3 — shippable

- Expanded **Ghostty** README checklist (theme, opacity, blur, IME, Kitty keyboard).
- Unit/smoke tests without TTY (`resolveWsUrl`, command registry, stream handler); `scripts/smoke-daemon.mjs` unchanged.
- Version **0.2.0**.
