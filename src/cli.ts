import { resolveWsUrl } from "./client/paseo.js";

export type CliArgs = {
  help: boolean;
  bindId?: string;
  createNew: boolean;
  provider?: string;
  importStub: boolean;
  host?: string;
  wsUrl: string;
  unknown: string[];
};

const HELP = `paseo-tui — Ghostty-first TUI for a single Paseo agent session

Usage:
  paseo-tui [options]
  pt [options]

Options:
  --help                Show this help
  --bind <id>           Bind an existing agent by id
  --new                 Create a new agent on start
  --provider <p/m>      Provider/model for --new (default: env PASEO_PROVIDER or codex/gpt-5.5)
  --import              Stub import flow, then enter TUI
  --host <host[:port]>  Daemon host (maps to ws://host:port/ws)
                        Also accepts a full ws(s):// URL

Environment:
  PASEO_WS_URL          Full WebSocket URL (default ws://127.0.0.1:6767/ws)
  PASEO_HOST            Host or host:port (alternative to --host)
  PASEO_PASSWORD        Daemon password when required
  PASEO_PROVIDER        Default provider/model for /new and --new
  PASEO_CONNECT_TIMEOUT_MS  Daemon connect timeout in ms (default 5000)

Without flags, starts unbound and tips you to use /bind, /new, or /import.
`;

export function parseArgs(argv: string[] = process.argv.slice(2)): CliArgs {
  const unknown: string[] = [];
  let help = false;
  let bindId: string | undefined;
  let createNew = false;
  let provider: string | undefined;
  let importStub = false;
  let host: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "--help":
      case "-h":
        help = true;
        break;
      case "--bind": {
        const next = argv[++i];
        if (!next || next.startsWith("-")) {
          throw new Error("--bind requires an agent id");
        }
        bindId = next;
        break;
      }
      case "--new":
        createNew = true;
        break;
      case "--provider": {
        const next = argv[++i];
        if (!next || next.startsWith("-")) {
          throw new Error("--provider requires a provider/model value");
        }
        provider = next;
        break;
      }
      case "--import":
        importStub = true;
        break;
      case "--host": {
        const next = argv[++i];
        if (!next || next.startsWith("-")) {
          throw new Error("--host requires a host[:port] or ws URL");
        }
        host = next;
        break;
      }
      default:
        if (arg.startsWith("-")) unknown.push(arg);
        else unknown.push(arg);
        break;
    }
  }

  return {
    help,
    bindId,
    createNew,
    provider,
    importStub,
    host,
    wsUrl: resolveWsUrl(host),
    unknown,
  };
}

export function printHelp(): void {
  process.stdout.write(HELP);
}
