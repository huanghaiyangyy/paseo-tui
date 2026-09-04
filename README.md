# paseo-tui

Ghostty-first terminal TUI for a single Paseo agent session.

## Scope

- Bind an existing agent, create a new agent (interactive model picker), or import a provider session
- Slash commands for help, bind, new, import, model, think, cwd, detach, quit
- Non-slash input sends a prompt to the bound agent
- Dracula Transparent styling with ANSI only (no opaque full-screen backgrounds)
- `/model` applies to the live agent via daemon `setAgentModel` when bound
- `/think` stores a local preference and tries `setAgentThinkingOption` on a live agent; also passes `thinkingOptionId` on `/new` when set

## Non-goals

- No embedded PTY or shell multiplexing
- No multi-session or multi-pane agent management

## Requirements

- Node.js 22 or newer
- A running Paseo daemon on WebSocket (default port 6767)

## Ghostty

Recommended Ghostty config so transparency shows through:

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
- `bind [id]` – list agents via SDK, or bind by id
- `new [provider/model]` – with no arg, opens a SelectList of ready `provider/model` entries; with arg, creates directly
- `import` – fetch recent provider sessions for this cwd, pick one, `importAgent`, bind
- `model [id]` – show current; with no arg and bound, optionally pick a model for the current provider; with arg, call `setAgentModel` on the live agent
- `think [level]` – set reasoning effort (`thinkingOptionId` on create / live when supported)
- `cwd` – show process and agent cwd
- `detach` – unbind without archiving
- `quit` – stop TUI and exit

## Smoke (non-TTY)

```bash
node scripts/smoke-daemon.mjs
```

Lists ready providers/models and calls `fetchRecentProviderSessions` against the local daemon.

## License

MIT
