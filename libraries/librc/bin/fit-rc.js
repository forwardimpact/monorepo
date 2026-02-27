#!/usr/bin/env node
/**
 * Service manager CLI (s6-rc equivalent).
 * Communicates with svscan daemon via Unix socket.
 */
import { parseArgs } from "node:util";

import { createInitConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";

import { ServiceManager, sendCommand, waitForSocket } from "../index.js";

const { values, positionals } = parseArgs({
  options: {
    help: { type: "boolean", short: "h", default: false },
    silent: { type: "boolean", short: "s", default: false },
  },
  allowPositionals: true,
});

const baseLogger = createLogger("rc");
const isSilent = values.silent;
const logger = {
  debug: (...a) => !isSilent && baseLogger.debug(...a),
  info: (...a) => !isSilent && baseLogger.info(...a),
  error: (...a) => baseLogger.error(...a),
  exception: (...a) => baseLogger.exception(...a),
};

const [command, serviceName] = positionals;

/** Prints usage information */
function help() {
  logger.info("help", "Usage: fit-rc <command> [service] [options]");
  logger.info("help", "Commands: start, stop, status, restart");
  logger.info("help", "Options: -h, --help, -s, --silent");
  logger.info(
    "help",
    "If service is specified, start/stop operates up to that service",
  );
}

if (values.help || !command) {
  help();
  process.exit(command ? 0 : 1);
}

const config = await createInitConfig();
const manager = new ServiceManager(config, logger, {
  sendCommand,
  waitForSocket,
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
    await manager.stop(serviceName);
    await manager.start(serviceName);
    break;
  default:
    logger.error("main", "Unknown command", { command });
    help();
    process.exit(1);
}
