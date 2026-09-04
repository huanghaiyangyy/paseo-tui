# paseo-tui

Ghostty-first terminal TUI for a single Paseo agent session.

## Scope

- Bind an existing agent (SelectList or id), create a new agent (interactive model picker), or import a provider session
- Live streaming timeline (assistant deltas, tools, reasoning, errors, permissions)
- Slash commands for help, bind, switch, new, import, model, think, allow, deny, perms, cwd, detach, quit
- Dracula Transparent styling with ANSI only (no opaque full-screen backgrounds)
- `/model` applies to the live agent via daemon `setAgentModel` when bound
- `/think` stores a local preference, opens a picker when bound, and tries `setAgentThinkingOption`; also passes `thinkingOptionId` on `/new`
- Default provider/model: `grok-gateway/grok-4.5` (`PASEO_PROVIDER` overrides)

## Non-goals

- No embedded PTY or shell multiplexing
- No multi-session or multi-pane agent management
- No automatic WebSocket reconnect (disabled so TUI subscriptions stay single-owned; footer shows connection state)

## Requirements

- Node.js 22 or newer
- A running Paseo daemon on WebSocket (default port 6767)

## Ghostty

Recommended Ghostty config so transparency and keyboard behavior feel right:

Checklist:
- [ ] `theme = dracula` (or a Dracula-compatible theme)
- [ ] `background-opacity = 0.85` (or preferred; TUI avoids opaque full-screen paints)
- [ ] `background-blur = 20` (optional; macOS / supported platforms)
- [ ] IME / input method: confirm CJK or compose keys work in the editor (Ghostty GTK/macOS IME)
- [ ] Kitty keyboard protocol: leave Ghostty defaults enabled so modified keys and chords reach pi-tui reliably

Example snippet:

    theme = dracula
    background-opacity = 0.85
    background-blur = 20

## Install and run

```bash
npm install
npm run build
npm start
# or: npx tsx src/main.ts
```

Bin names: `paseo-tui` and `pt`.

## CLI flags

- `--help`
- `--bind <id>`
- `--new` plus optional `--provider <provider/model>`
- `--import` — enter TUI and open the real provider-session import picker
- `--host <host[:port]|ws-url>`

Env vars: `PASEO_WS_URL`, `PASEO_HOST`, `PASEO_PASSWORD`, `PASEO_PROVIDER`, `PASEO_CONNECT_TIMEOUT_MS` (default 5000).

With no flags, the TUI starts unbound and tips `/bind` `/new` `/import`.

## Slash commands

- `help` — list commands
- `bind [id]` – SelectList of agents via SDK, or bind by id
- `new [provider/model]` – with no arg, opens a SelectList of ready `provider/model` entries; with arg, creates directly
- `import` – fetch recent provider sessions for this cwd, pick one, `importAgent`, bind
- `model [id]` – show current; with no arg and bound, optionally pick a model for the current provider; with arg, call `setAgentModel` on the live agent
- `think [level]` – picker when bound / no args; else set thinkingOptionId
- `allow` / `deny` / `perms` – respondToPermission helpers
- `switch [id]` – rebind another agent
- `cwd` – show process and agent cwd
- `detach` – unbind without archiving
- `quit` – stop TUI and exit

## Tests / smoke

```bash
npm test
npm run typecheck
npm run build
node scripts/smoke-daemon.mjs
```

Lists ready providers/models and calls `fetchRecentProviderSessions` against the local daemon.

## License

MIT
