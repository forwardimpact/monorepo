#!/usr/bin/env node
/**
 * Service manager CLI (s6-rc equivalent).
 * Communicates with svscan daemon via Unix socket.
 */
import "@forwardimpact/libpreflight/node22";

import { spawn, execSync } from "node:child_process";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createCli } from "@forwardimpact/libcli";
import { createInitConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";

import { ServiceManager, sendCommand, waitForSocket } from "../src/index.js";

const runtime = createDefaultRuntime();

const definition = {
  name: "fit-rc",
  description: "Service manager for Forward Impact",
  commands: [
    { name: "start", args: "[service]", description: "Start services" },
    { name: "stop", args: "[service]", description: "Stop services" },
    { name: "status", args: "[service]", description: "Show service status" },
    { name: "restart", args: "[service]", description: "Restart services" },
    {
      name: "logs",
      args: "<service>",
      description: "Print a service's current log to stdout",
    },
  ],
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    silent: {
      type: "boolean",
      short: "s",
      description: "Suppress info/debug output",
    },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  examples: [
    "fit-rc start",
    "fit-rc stop agent",
    "fit-rc status",
    "fit-rc logs trace",
  ],
  documentation: [
    {
      title: "Start, Stop, or Check a Service",
      url: "https://www.forwardimpact.team/docs/libraries/service-lifecycle/manage-service/index.md",
      description:
        "Start, stop, restart, check status, and read logs through one interface.",
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
const parsed = cli.parse(runtime.proc.argv.slice(2));
if (!parsed) runtime.proc.exit(0);

const { values, positionals } = parsed;
const [command, serviceName] = positionals;

const baseLogger = createLogger("rc", runtime);
const isSilent = values.silent;
const logger = {
  debug: (...a) => !isSilent && baseLogger.debug(...a),
  info: (...a) => !isSilent && baseLogger.info(...a),
  error: (...a) => baseLogger.error(...a),
  exception: (...a) => baseLogger.exception(...a),
};

if (!command) {
  cli.usageError("no command specified");
  runtime.proc.exit(2);
}

const config = await createInitConfig();
const manager = new ServiceManager(config, logger, {
  runtime,
  sendCommand: (socketPath, cmd) => sendCommand(socketPath, cmd),
  waitForSocket: (socketPath, timeout) =>
    waitForSocket(socketPath, timeout, runtime),
  spawn,
  execSync,
});

switch (command) {
  case "start":
    await manager.start(serviceName);
    break;
  case "stop":
    await manager.stop(serviceName);
    break;
  case "status":
    await manager.status(serviceName);
    break;
  case "restart":
    await manager.restart(serviceName);
    break;
  case "logs":
    if (!serviceName) {
      cli.usageError("missing required service argument");
      runtime.proc.exit(2);
    }
    await manager.logs(serviceName);
    break;
  default:
    cli.usageError(`unknown command "${command}"`);
    runtime.proc.exit(2);
}

runtime.proc.exit(0);
