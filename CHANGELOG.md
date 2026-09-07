# Changelog

## 0.2.8 – 2026-09-07

### Session rename + title chrome

- **`/rename [name]`**: show the bound agent's display title, or set it through
  daemon `updateAgent({ name })` (same RPC as `paseo agent update --name`).
  Quotes around the name are optional; titles over 200 chars are rejected.
- **Live title**: header uses the session name when bound (`(untitled <id>)`
  if missing); footer `bound:` chip and `statusLine` prefer the title over
  the short agent id. Bind / switch / new / import / detach messages include
  `Title (shortId)`.
- Agent snapshots (bind + `agent_update` upserts) keep `state.title` in sync
  when Paseo auto-names or another client renames the session.

## 0.2.7 – 2026-09-05

### Bind / import pickers

- **`/bind` `/switch`**: list rows lead with session title, then status,
  `provider/model`, think level, short id, relative time, cwd, labels,
  and attention/perms. Tabs: All · running/idle/… · provider (when more
  than one). Tab / ← → / 1-9 switch tabs.
- **`/import`**: stop filtering to `process.cwd()` (that hid Grok/Codex/Pi
  sessions in other folders). Tabs: All · This folder · Grok · Codex · …
  Each row shows title, provider, time, cwd, and prompt preview.

## 0.2.6 – 2026-09-05

### Fix — session load jank + incomplete tool/think

Live `agent_stream` items are **deltas** (often 1–5 chars of think, many
assistant chunks, running+completed tools). 0.2.5 treated each as a new
widget and only read `detail.input`, so bind felt frozen and the timeline
showed `(no preview)` / fragmented think.

- **In-place merge**: consecutive reasoning concatenates; assistant updates
  by `messageId` (delta or snapshot); tools upsert by `callId`.
- **Canonical tool preview**: `shell.command`, `read/edit.filePath`, output
  clipping, `metadata.title` fallback. No more empty `(no preview)` boxes
  for grok execute/read/edit.
- **Projected history on bind**: `timeline.refetch({ projection: "projected" })`
  paints merged history in one batch; live events are buffered then catchup-
  merged so we don't double-print the race window.
- **Render**: batch during hydrate; don't `setStatus` on every token;
  keep streaming assistant as Text until turn finalize (no highlight.js
  per token). Reconnect skips re-hydrate so the view isn't wiped.

## 0.2.5 – 2026-09-05

### P0 — collapsible tools + usage footer

- **Collapsible tool blocks**: long tools (body > 2 lines) render as a compact
  one-liner `▶ ⚙ tool · Name · preview · (N lines) · /expand`; short tools keep
  the Codex-style box. `/expand` / `/collapse` toggle the last tool.
- **Token / cost footer**: reads `agent.lastUsage` after turns and on subscribe
  updates; right-side chips `↑in ↓out · $cost · ctx%` when present (graceful when null).
- Footer hint `▾tools /expand` when any tool is collapsed.

### P1 — streaming highlight + think collapse

- **Streaming highlight**: `@earendil-works/pi-tui` 0.85 has no
  `createHighlightStream`; mid-stream Text promotes to Markdown early once
  fenced blocks look complete, then `setText` keeps highlighting as lines finish.
- **Think collapse**: reasoning defaults collapsed when ≥120 chars
  (`▶ think · preview… · (N chars) · /think-expand`); short thinks stay open.
  `/think-expand` expands last; `/thinking` toggles.
- Help lists the new slash commands. Unit tests for collapse helpers + usage
  formatting. Demo: `/workspace/apps/shots/ui-p0p1.png`.


## 0.2.4 – 2026-09-05

### Markdown / code chrome (Pi · Codex feel)

- **Syntax highlighting**: `markdownTheme.highlightCode` via `highlight.js` with
  Dracula-ish ANSI token colors (keyword pink, string yellow, comment muted,
  number orange, …). Unknown langs still soft-style through `codeBlock`.
- **Code / quote blocks**: stronger `codeBlockBorder` (muted ``` + pink lang tag);
  `codeBlockIndent` uses a muted `│ `; quote borders more visible; pink H1/H2.
- **Tool blocks**: Codex-like unicode box (`╭─ ⚙ tool · Name ──` / `│` / `╰──`);
  `timeline.appendTool` uses `styleToolBlock`; best-effort `appendToolResult`
  for completed/failed statuses; stream previews tool input when present.
- Demo shot: `/workspace/apps/shots/ui-blocks-md.png`.

## 0.2.3 – 2026-09-05

### UI polish (Pi / Codex-like chrome)

- **Header bar**: live `HeaderBar` with branded title + compact chips
  (`model · think · agent · conn`) and a muted `─` rule; updates with status.
- **Timeline**: Pi-like role labels (`❯ you`, `✦ agent`, dim italic `think`,
  orange `⚙ tool`); **Markdown** agent replies (Dracula `MarkdownTheme`);
  mid-stream `Text` + finalize to Markdown; thin `Spacer(1)` between turns.
- **Footer**: two-tone status (`conn · bound` left, `model · think` right)
  with width-safe truncation.
- **Welcome**: short tip line instead of verbose MVP copy.
- **Picker**: pink selected highlight (›-style theming).
- Ghostty transparency preserved — no full-screen opaque backgrounds.

## 0.2.2 – 2026-09-05

### Fix idle / grok-gateway agent bind

- Advertise `appVersion` from package.json in the daemon `hello` handshake.
  Without `appVersion >= 0.1.45`, the daemon only returns legacy providers
  (`claude` / `codex` / `opencode`), so idle `grok-gateway` agents were invisible
  to `fetchAgents` / `fetchAgent` / `--bind` / `/bind` even though `paseo ls` (which
  sends a CLI version) listed them.
- `listAgents` now uses `scope: "active"` with `page.limit: 100` (CLI-aligned).
- `bindExistingAgent` resolves short id prefixes via the active list when needed.


## 0.2.1 – 2026-09-05

### Safe auto-reconnect (single session)

- Enable SDK WebSocket reconnect by default (`baseDelayMs` 1s, `maxDelayMs` ~30s).
- On unexpected disconnect: footer shows conn:reconnecting; timeline notes reconnect-in-progress.
- On success: unsubscribe old handlers, refresh + re-bind current agent (timeline/agent subscribe + permission watchers), one system line in the timeline.
- /quit and Ctrl+C disables reconnect and closes cleanly.
- Disable with PASEO_RECONNECT=0 (also false / off / no).
- Clearer connect-failure messages; footer labels normalized to connected|reconnecting|disconnected.
- README: one-window-one-session model; document reconnect; confirm no multi-pane / no PTY.
- Unit tests for reconnect env, backoff, footer labels, and connect errors (no TTY).

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
