#!/usr/bin/env node
/**
 * svscan - Supervision daemon that manages a SupervisionTree.
 * Listens on a Unix domain socket for control commands.
 * This is a pure supervisor - it knows nothing about service order or oneshots.
 */
import "@forwardimpact/libpreflight/node22";

import { readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";

import { createCli } from "@forwardimpact/libcli";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createLogger } from "@forwardimpact/libtelemetry";

import { SupervisionTree } from "../src/tree.js";

const runtime = createDefaultRuntime();
const fs = runtime.fsSync;

// `bun build --compile` injects FIT_SVSCAN_VERSION via --define, eliminating
// the readFileSync branch in the compiled binary (which would ENOENT against
// the bunfs virtual mount). Source execution falls through to package.json.
const VERSION =
  process.env.FIT_SVSCAN_VERSION ||
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    .version;

const definition = {
  name: "fit-svscan",
  version: VERSION,
  description: "Supervision daemon that manages a SupervisionTree",
  globalOptions: {
    socket: {
      type: "string",
      short: "s",
      description: "Path to Unix socket",
    },
    pid: { type: "string", short: "p", description: "Path to PID file" },
    logdir: {
      type: "string",
      short: "l",
      description: "Path to log directory",
    },
    timeout: {
      type: "string",
      short: "t",
      description: "Shutdown timeout in ms (default: 3000)",
    },
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  examples: [
    "fit-svscan --socket /tmp/sv.sock --pid /tmp/sv.pid --logdir /tmp/logs",
  ],
};

const cli = createCli(definition, { runtime });
const logger = createLogger("svscan", runtime);

const parsed = cli.parse(process.argv.slice(2));
if (!parsed) runtime.proc.exit(0);

const { values } = parsed;

if (!values.socket || !values.pid || !values.logdir) {
  cli.usageError("missing required arguments: --socket, --pid, --logdir");
  runtime.proc.exit(2);
}

const socketPath = path.resolve(values.socket);
const pidPath = path.resolve(values.pid);
const logDir = path.resolve(values.logdir);
const shutdownTimeout = parseInt(values.timeout || "3000", 10);

const tree = new SupervisionTree(logDir, { runtime, shutdownTimeout, logger });

/**
 * Handles a command from a client
 * @param {string} line - Command line (JSON format)
 * @returns {Promise<object>} Response object
 */
async function handleCommand(line) {
  let msg;
  try {
    msg = JSON.parse(line.trim());
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }

  const { command: cmd, name, cmd: serviceCmd, cwd } = msg;

  switch (cmd) {
    case "add": {
      if (!name || !serviceCmd) {
        return { ok: false, error: "add requires name and cmd" };
      }
      try {
        await tree.add(name, serviceCmd, { cwd });
        return { ok: true, message: `added ${name}` };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }

    case "remove": {
      if (!name) {
        return { ok: false, error: "remove requires name" };
      }
      try {
        await tree.remove(name);
        return { ok: true, message: `removed ${name}` };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }

    case "status": {
      const status = tree.getStatus();
      return { ok: true, services: status };
    }

    case "shutdown": {
      logger.info("svscan", "Shutdown requested");
      await tree.stop();
      cleanup();
      runtime.proc.exit(0);
      break; // Unreachable but required for ESLint
    }

    case "ping": {
      return { ok: true, message: "pong" };
    }

    default:
      return { ok: false, error: `unknown command: ${cmd}` };
  }
}

/** Cleans up socket and PID files */
function cleanup() {
  try {
    fs.unlinkSync(socketPath);
  } catch {
    // Ignore
  }
  try {
    fs.unlinkSync(pidPath);
  } catch {
    // Ignore
  }
}

/** Handles graceful shutdown */
async function shutdown() {
  logger.info("svscan", "Signal received, shutting down...");
  await tree.stop();
  cleanup();
  runtime.proc.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Clean up stale socket
try {
  fs.unlinkSync(socketPath);
} catch {
  // Ignore
}

// Create Unix socket server
const server = net.createServer((conn) => {
  let buffer = "";

  conn.on("data", async (data) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.trim()) {
        const response = await handleCommand(line);
        conn.write(JSON.stringify(response) + "\n");
        conn.end();
      }
    }
  });

  conn.on("error", () => {
    // Client disconnected, ignore
  });
});

server.listen(socketPath, async () => {
  // Write PID file
  fs.writeFileSync(pidPath, String(runtime.proc.pid));

  // Start the supervision tree
  await tree.start();

  logger.info("svscan", "Started", {
    pid: runtime.proc.pid,
    socket: socketPath,
    log_dir: logDir,
  });
});

server.on("error", (err) => {
  logger.error("svscan", "Server error", { error: err.message });
  runtime.proc.exit(1);
});
