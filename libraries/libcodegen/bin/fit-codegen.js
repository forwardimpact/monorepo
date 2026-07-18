#!/usr/bin/env node

import "@forwardimpact/libpreflight/node22";

import { createCli } from "@forwardimpact/libcli";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createLogger } from "@forwardimpact/libtelemetry";

const definition = {
  name: "fit-codegen",
  description:
    "Generate code from proto contracts, or download a pre-generated bundle. `generate` needs the optional proto-compiler toolchain; `download` is lean and fetches the bundle a production image consumes at startup.",
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  commands: [
    {
      name: "generate",
      description:
        "Generate protobuf types, service clients, and definitions from .proto files in installed @forwardimpact/* packages (node_modules/@forwardimpact/*/proto/) and an optional project-local proto/ directory.",
      options: {
        all: { type: "boolean", description: "Generate all code" },
        type: { type: "boolean", description: "Generate protobuf types only" },
        service: {
          type: "boolean",
          description: "Generate service bases only",
        },
        client: { type: "boolean", description: "Generate clients only" },
        definition: {
          type: "boolean",
          description: "Generate service definitions only",
        },
        metadata: {
          type: "boolean",
          description: "Generate field metadata only",
        },
      },
      examples: [
        "npx fit-codegen generate --all",
        "npx fit-codegen generate --type",
        "npx fit-codegen generate --service",
      ],
    },
    {
      name: "download",
      description:
        "Download the generated code bundle from remote storage and unpack it. Append `-- <command>` to exec a process after the download completes.",
      examples: [
        "npx fit-codegen download",
        "npx fit-codegen download -- bun server.js",
      ],
    },
  ],
  examples: ["npx fit-codegen generate --all", "npx fit-codegen download"],
  documentation: [
    {
      title: "Keep Types Synced with Proto Definitions",
      url: "https://www.forwardimpact.team/docs/libraries/typed-contracts/index.md",
      description:
        "One source of truth from proto definition to runtime: types, MCP tools, and service endpoints regenerated with fit-codegen.",
    },
  ],
};

const HANDLERS = {
  generate: () => import("../src/commands/generate.js"),
  download: () => import("../src/commands/download.js"),
};

const runtime = createDefaultRuntime();
const cli = createCli(definition, {
  runtime,
  packageJsonUrl: new URL("../package.json", import.meta.url),
});
const logger = createLogger("codegen", runtime);

/**
 * Parse argv and route the leading positional to its subcommand handler. A
 * bare invocation shows help (exit 0), the subcommand surface's front door.
 * @returns {Promise<void>}
 */
async function main() {
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  const subcommand = parsed.positionals[0];
  if (!subcommand) {
    cli.showHelp();
    return;
  }

  const load = HANDLERS[subcommand];
  if (!load) {
    cli.usageError(
      `unknown command "${subcommand}" (expected generate or download)`,
    );
    process.exit(2);
  }

  const { run } = await load();
  await run({ values: parsed.values, runtime, cli });
}

main().catch((error) => {
  logger.exception("main", error);
  cli.error(error.message);
  process.exit(1);
});
