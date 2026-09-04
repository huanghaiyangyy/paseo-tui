# paseo-tui

Ghostty-first terminal TUI for a single Paseo agent session.
## MVP scope

- Bind an existing agent, create a new agent, or stub-import a provider session
- Slash commands for help, bind, new, import, model, think, cwd, detach, quit
- Non-slash input sends a prompt to the bound agent
- Dracula Transparent styling with ANSI only (no opaque full-screen backgrounds)

## Non-goals

- No embedded PTY or shell multiplexing
- No multi-session or multi-pane agent management
- Import UI is stubbed for now

## Requirements

- Node.js 22 or newer
- A running Paseo daemon on WebSocket (default port 6767)

## Ghostty

Recommended Ghostty config so transparency shows through:

    theme = dracula
    background-opacity = 0.85
    background-blur = 20

## Install and run

Dependencies are declared in package.json. After installing them, run the project build script, then the start script.

Development entrypoint: src/main.ts via tsx.

Bin names: paseo-tui and pt.

## CLI flags

- help
- bind id
- new plus provider model
- import (stub, then enter TUI)
- host as host:port or a ws URL

Env vars: PASEO_WS_URL, PASEO_HOST, PASEO_PASSWORD, PASEO_PROVIDER, PASEO_CONNECT_TIMEOUT_MS (default 5000).

With no flags, the TUI starts unbound and tips /bind /new /import.

## Slash commands

- help: list commands
- bind [id]: list agents via SDK, or bind by id
- new [provider/model]: create and bind an agent
- import: stub (TODO daemon import RPCs)
- model [id]: local model preference (daemon setAgentModel may need RPC)
- think [level]: local stub reasoning effort
- cwd: show process and agent cwd
- detach: unbind without archiving
- quit: stop TUI and exit

## License

MIT
