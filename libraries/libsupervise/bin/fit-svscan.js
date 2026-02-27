#!/usr/bin/env node
/**
 * svscan - Supervision daemon that manages a SupervisionTree.
 * Listens on a Unix domain socket for control commands.
 * This is a pure supervisor - it knows nothing about service order or oneshots.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { parseArgs } from "node:util";

import { createLogger } from "@forwardimpact/libtelemetry";

import { SupervisionTree } from "../tree.js";

const logger = createLogger("svscan");

const { values } = parseArgs({
  options: {
    socket: {
      type: "string",
      short: "s",
    },
    pid: {
      type: "string",
      short: "p",
    },
    logdir: {
      type: "string",
      short: "l",
    },
    timeout: {
      type: "string",
      short: "t",
      default: "3000",
    },
  },
});

if (!values.socket || !values.pid || !values.logdir) {
  logger.error("main", "Missing required arguments: --socket, --pid, --logdir");
  process.exit(1);
}

const socketPath = path.resolve(values.socket);
const pidPath = path.resolve(values.pid);
const logDir = path.resolve(values.logdir);
const shutdownTimeout = parseInt(values.timeout, 10);

const tree = new SupervisionTree(logDir, { shutdownTimeout });

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
      process.exit(0);
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
  process.exit(0);
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
  fs.writeFileSync(pidPath, String(process.pid));

  // Start the supervision tree
  await tree.start();

  logger.info("svscan", "Started", {
    pid: process.pid,
    socket: socketPath,
    log_dir: logDir,
  });
});

server.on("error", (err) => {
  logger.error("svscan", "Server error", { error: err.message });
  process.exit(1);
});
