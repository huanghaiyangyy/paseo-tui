#!/usr/bin/env node
import { parseArgs, printHelp } from "./cli.js";
import { startApp } from "./ui/app.js";

async function main(): Promise<void> {
  let args;
  try {
    args = parseArgs();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    printHelp();
    return;
  }

  if (args.unknown.length > 0) {
    process.stderr.write(`Unknown arguments: ${args.unknown.join(" ")}\n`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  await startApp({
    wsUrl: args.wsUrl,
    bindId: args.bindId,
    createNew: args.createNew,
    provider: args.provider,
    importStub: args.importStub,
  });
}

main().catch((err) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
