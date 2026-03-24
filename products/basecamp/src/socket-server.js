/**
 * SocketServer — Unix socket IPC for daemon communication.
 */

import { createServer } from "node:net";
import { createConnection } from "node:net";
import {
  existsSync,
  unlinkSync,
  chmodSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { computeNextWakeAt } from "./scheduler.js";

export class SocketServer {
  #socketPath;
  #agentRunner;
  #stateManager;
  #log;
  #loadConfig;
  #cacheDir;
  #daemonStartedAt;
  #server;

  /**
   * @param {string} socketPath
   * @param {import('./scheduler.js').Scheduler} scheduler
   * @param {import('./agent-runner.js').AgentRunner} agentRunner
   * @param {import('./state-manager.js').StateManager} stateManager
   * @param {Function} loadConfig
   * @param {Function} logFn
   * @param {string} cacheDir
   * @param {number} daemonStartedAt
   */
  constructor(
    socketPath,
    scheduler,
    agentRunner,
    stateManager,
    loadConfig,
    logFn,
    cacheDir,
    daemonStartedAt,
  ) {
    if (!socketPath) throw new Error("socketPath is required");
    if (!scheduler) throw new Error("scheduler is required");
    if (!agentRunner) throw new Error("agentRunner is required");
    if (!stateManager) throw new Error("stateManager is required");
    if (!loadConfig) throw new Error("loadConfig is required");
    if (!logFn) throw new Error("logFn is required");
    if (!cacheDir) throw new Error("cacheDir is required");
    this.#socketPath = socketPath;
    this.#agentRunner = agentRunner;
    this.#stateManager = stateManager;
    this.#loadConfig = loadConfig;
    this.#log = logFn;
    this.#cacheDir = cacheDir;
    this.#daemonStartedAt = daemonStartedAt;
  }

  /**
   * @param {import('node:net').Socket} socket
   * @param {Object} data
   */
  #send(socket, data) {
    try {
      socket.write(JSON.stringify(data) + "\n");
    } catch {}
  }

  /**
   * @param {string} p
   * @returns {string}
   */
  #expandPath(p) {
    return p.startsWith("~/") ? join(homedir(), p.slice(2)) : resolve(p);
  }

  /**
   * Resolve briefing file for an agent
   * @param {string} agentName
   * @param {Object} agentConfig
   * @returns {string|null}
   */
  #resolveBriefingFile(agentName, agentConfig) {
    const stateDir = join(this.#cacheDir, "state");
    if (existsSync(stateDir)) {
      const prefix = agentName.replace(/-/g, "_") + "_";
      const matches = readdirSync(stateDir).filter(
        (f) => f.startsWith(prefix) && f.endsWith(".md"),
      );
      if (matches.length > 0) {
        let latest = join(stateDir, matches[0]);
        let latestMtime = statSync(latest).mtimeMs;
        for (let i = 1; i < matches.length; i++) {
          const p = join(stateDir, matches[i]);
          const mt = statSync(p).mtimeMs;
          if (mt > latestMtime) {
            latest = p;
            latestMtime = mt;
          }
        }
        return latest;
      }
    }

    if (agentConfig.kb) {
      const dir = join(
        this.#expandPath(agentConfig.kb),
        "knowledge",
        "Briefings",
      );
      if (existsSync(dir)) {
        const files = readdirSync(dir)
          .filter((f) => f.endsWith(".md"))
          .sort()
          .reverse();
        if (files.length > 0) return join(dir, files[0]);
      }
    }

    return null;
  }

  /**
   * @param {import('node:net').Socket} socket
   */
  #handleStatusRequest(socket) {
    const config = this.#loadConfig();
    const state = this.#stateManager.load();
    const now = new Date();
    const agents = {};

    for (const [name, agent] of Object.entries(config.agents)) {
      const as = state.agents[name] || {};
      agents[name] = {
        enabled: agent.enabled !== false,
        status: as.status || "never-woken",
        lastWokeAt: as.lastWokeAt || null,
        nextWakeAt: computeNextWakeAt(agent, as, now),
        lastAction: as.lastAction || null,
        lastDecision: as.lastDecision || null,
        wakeCount: as.wakeCount || 0,
        lastError: as.lastError || null,
        kbPath: agent.kb ? this.#expandPath(agent.kb) : null,
        briefingFile: this.#resolveBriefingFile(name, agent),
      };
      if (as.startedAt) agents[name].startedAt = as.startedAt;
    }

    this.#send(socket, {
      type: "status",
      uptime: this.#daemonStartedAt
        ? Math.floor((Date.now() - this.#daemonStartedAt) / 1000)
        : 0,
      agents,
    });
  }

  /**
   * @param {import('node:net').Socket} socket
   * @param {string} line
   */
  #handleMessage(socket, line) {
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      this.#send(socket, { type: "error", message: "Invalid JSON" });
      return;
    }

    if (request.type === "status") return this.#handleStatusRequest(socket);

    if (request.type === "shutdown") {
      this.#log("Shutdown requested via socket.");
      this.#send(socket, { type: "ack", command: "shutdown" });
      socket.end();
      this.#agentRunner.killActiveChildren();
      process.exit(0);
    }

    if (request.type === "wake") {
      if (!request.agent) {
        this.#send(socket, { type: "error", message: "Missing agent name" });
        return;
      }
      const config = this.#loadConfig();
      const agent = config.agents[request.agent];
      if (!agent) {
        this.#send(socket, {
          type: "error",
          message: `Agent not found: ${request.agent}`,
        });
        return;
      }
      this.#send(socket, {
        type: "ack",
        command: "wake",
        agent: request.agent,
      });
      const state = this.#stateManager.load();
      this.#agentRunner.wake(request.agent, agent, state, config.env).catch(() => {});
      return;
    }

    this.#send(socket, {
      type: "error",
      message: `Unknown request type: ${request.type}`,
    });
  }

  /**
   * Start the socket server
   * @returns {import('node:net').Server}
   */
  start() {
    try {
      unlinkSync(this.#socketPath);
    } catch {}

    this.#server = createServer((socket) => {
      let buffer = "";
      socket.on("data", (data) => {
        buffer += data.toString();
        let idx;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (line) this.#handleMessage(socket, line);
        }
      });
      socket.on("error", () => {});
    });

    this.#server.listen(this.#socketPath, () => {
      chmodSync(this.#socketPath, 0o600);
      this.#log(`Socket server listening on ${this.#socketPath}`);
    });

    this.#server.on("error", (err) => {
      this.#log(`Socket server error: ${err.message}`);
    });

    const cleanup = () => {
      this.#agentRunner.killActiveChildren();
      this.#server.close();
      try {
        unlinkSync(this.#socketPath);
      } catch {}
      process.exit(0);
    };
    process.on("SIGTERM", cleanup);
    process.on("SIGINT", cleanup);

    return this.#server;
  }

  /**
   * Stop the socket server
   */
  stop() {
    if (this.#server) {
      this.#server.close();
    }
    try {
      unlinkSync(this.#socketPath);
    } catch {}
  }
}

/**
 * Connect to the daemon socket and request graceful shutdown.
 * @param {string} socketPath
 * @returns {Promise<boolean>}
 */
export async function requestShutdown(socketPath) {
  if (!existsSync(socketPath)) {
    console.log("Daemon not running (no socket).");
    return false;
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log("Shutdown timed out.");
      socket.destroy();
      resolve(false);
    }, 5000);

    const socket = createConnection(socketPath, () => {
      socket.write(JSON.stringify({ type: "shutdown" }) + "\n");
    });

    let buffer = "";
    socket.on("data", (data) => {
      buffer += data.toString();
      if (buffer.includes("\n")) {
        clearTimeout(timeout);
        console.log("Daemon stopped.");
        socket.destroy();
        resolve(true);
      }
    });

    socket.on("error", () => {
      clearTimeout(timeout);
      console.log("Daemon not running (connection refused).");
      resolve(false);
    });

    socket.on("close", () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}
