#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { createCli } from "@forwardimpact/libcli";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createLogger } from "@forwardimpact/libtelemetry";
import { countTokens } from "@forwardimpact/libutil";

const definition = {
  name: "fit-tiktoken",
  description: "Count tokens in text",
  usage: "fit-tiktoken <text>\n       echo 'text' | fit-tiktoken",
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  examples: ['fit-tiktoken "hello world"', "echo 'hello world' | fit-tiktoken"],
};

const runtime = createDefaultRuntime();
const cli = createCli(definition, {
  runtime,
  packageJsonUrl: new URL("../package.json", import.meta.url),
});
const logger = createLogger("tiktoken", runtime);

/**
 * Counts tokens in the provided text
 * @returns {Promise<void>}
 */
async function main() {
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  let text = parsed.positionals.join(" ");

  if (!text && !process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    text = Buffer.concat(chunks).toString().trim();
  }

  if (!text) {
    cli.usageError("expected text argument or stdin input");
    process.exit(2);
  }

  console.log(countTokens(text));
}

main().catch((error) => {
  logger.exception("main", error);
  cli.error(error.message);
  process.exit(1);
});
