#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import readline from "node:readline";

import { createCli } from "@forwardimpact/libcli";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { LogWriter } from "../src/logger.js";

const runtime = createDefaultRuntime();

const definition = {
  name: "fit-logger",
  description: "Log writer that reads stdin and writes rotated log files",
  globalOptions: {
    dir: {
      type: "string",
      short: "d",
      description: "Log directory (required)",
    },
    maxFileSize: {
      type: "string",
      short: "s",
      description: "Maximum log file size in bytes",
    },
    maxFiles: {
      type: "string",
      short: "n",
      description: "Maximum number of log files to keep",
    },
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  examples: [
    "fit-logger --dir /var/log/myapp",
    "fit-logger -d ./logs -s 1048576 -n 5",
  ],
  documentation: [
    {
      title: "Start, Stop, or Check a Service",
      url: "https://www.forwardimpact.team/docs/libraries/service-lifecycle/manage-service/index.md",
      description:
        "Manage services through one interface, including tuning log rotation with fit-logger.",
    },
    {
      title: "Manage Service Lifecycle from One Interface",
      url: "https://www.forwardimpact.team/docs/libraries/service-lifecycle/index.md",
      description:
        "The full lifecycle setup, including supervision and observability.",
    },
  ],
};

const cli = createCli(definition, {
  runtime,
  packageJsonUrl: new URL("../package.json", import.meta.url),
});

const parsed = cli.parse(process.argv.slice(2));
if (!parsed) runtime.proc.exit(0);

const { values } = parsed;

if (!values.dir) {
  cli.usageError("missing required option: --dir");
  runtime.proc.exit(2);
}

const writer = new LogWriter(values.dir, {
  runtime,
  config: {
    maxFileSize: values.maxFileSize
      ? parseInt(values.maxFileSize, 10)
      : undefined,
    maxFiles: values.maxFiles ? parseInt(values.maxFiles, 10) : undefined,
  },
});

await writer.init();

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on("line", async (line) => {
  await writer.write(line);
});

rl.on("close", async () => {
  await writer.close();
  runtime.proc.exit(0);
});

process.on("SIGTERM", async () => {
  rl.close();
});

process.on("SIGINT", async () => {
  rl.close();
});
