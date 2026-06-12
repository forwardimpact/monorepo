#!/usr/bin/env node

import "@forwardimpact/libpreflight/node22";

import { createCli } from "@forwardimpact/libcli";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createLogger } from "@forwardimpact/libtelemetry";

import { definition } from "../src/commands/benchmark-definition.js";

const runtime = createDefaultRuntime();
const logger = createLogger("benchmark", runtime);

async function main() {
  const cli = createCli(definition, {
    runtime,
    packageJsonUrl: new URL("../package.json", import.meta.url),
  });
  const parsed = cli.parse(runtime.proc.argv.slice(2));
  if (!parsed) return runtime.proc.exit(0);

  const { positionals } = parsed;
  if (positionals.length === 0) {
    cli.usageError("no command specified");
    return runtime.proc.exit(2);
  }

  const command = positionals[0];
  if (!definition.commands.some((c) => c.name === command)) {
    cli.usageError(`unknown command "${command}"`);
    return runtime.proc.exit(2);
  }

  const result = await cli.dispatch(parsed, { deps: { runtime } });
  const envelope = result ?? { ok: true };
  if (!envelope.ok && envelope.error) cli.error(envelope.error);
  runtime.proc.exit(envelope.ok ? 0 : (envelope.code ?? 1));
}

main().catch((error) => {
  logger.exception("main", error);
  createCli(definition, { runtime }).error(error.message);
  process.exit(1);
});
