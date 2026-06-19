/**
 * SocketServer — Unix socket IPC for daemon communication.
 */

import { createServer } from "node:net";
import { createConnection } from "node:net";
import { createLogger } from "@forwardimpact/libtelemetry";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { computeNextWakeAt, nowFromClock } from "./scheduler.js";
import { agentNameToStatePrefix, UnsafeAgentNameError } from "./agent-path.js";

/** Unix-socket IPC server that handles status queries, wake requests, and shutdown commands. */
export class SocketServer {
  #socketPath;
  #agentRunner;
  #stateManager;
  #log;
  #loadConfig;
  #cacheDir;
  #daemonStartedAt;
  #server;
  #fsSync;
  #clock;
  #proc;
  #resolveShutdown;
  #shutdownPromise;

  /**
   * @param {string} socketPath
   * @param {import('./scheduler.js').Scheduler} scheduler
   * @param {import('./agent-runner.js').AgentRunner} agentRunner
   * @param {import('./state-manager.js').StateManager} stateManager
   * @param {Function} loadConfig
   * @param {Function} logFn
   * @param {string} cacheDir
   * @param {number} daemonStartedAt
   * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
   *   Injected runtime bag (uses `fsSync`, `clock`, `proc`).
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
    runtime,
  ) {
    if (!socketPath) throw new Error("socketPath is required");
    if (!scheduler) throw new Error("scheduler is required");
    if (!agentRunner) throw new Error("agentRunner is required");
    if (!stateManager) throw new Error("stateManager is required");
    if (!loadConfig) throw new Error("loadConfig is required");
    if (!logFn) throw new Error("logFn is required");
    if (!cacheDir) throw new Error("cacheDir is required");
    if (!runtime?.fsSync) throw new Error("runtime.fsSync is required");
    if (!runtime?.clock) throw new Error("runtime.clock is required");
    if (!runtime?.proc) throw new Error("runtime.proc is required");
    this.#socketPath = socketPath;
    this.#agentRunner = agentRunner;
    this.#stateManager = stateManager;
    this.#loadConfig = loadConfig;
    this.#log = logFn;
    this.#cacheDir = cacheDir;
    this.#daemonStartedAt = daemonStartedAt;
    this.#fsSync = runtime.fsSync;
    this.#clock = runtime.clock;
    this.#proc = runtime.proc;
    this.#shutdownPromise = new Promise((r) => {
      this.#resolveShutdown = r;
    });
  }

  /**
   * Resolves once a shutdown has been requested (via socket or signal). The
   * daemon awaits this, then the bin translates it to `runtime.proc.exit(0)`.
   * @returns {Promise<void>}
   */
  whenStopped() {
    return this.#shutdownPromise;
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
   * Find the most recently modified file in a directory matching a filter.
   * @param {string} dir
   * @param {(name: string) => boolean} filter
   * @returns {string|null}
   */
  #latestFileByMtime(dir, filter) {
    const matches = this.#fsSync.readdirSync(dir).filter(filter);
    if (matches.length === 0) return null;
    let latest = join(dir, matches[0]);
    let latestMtime = this.#fsSync.statSync(latest).mtimeMs;
    for (let i = 1; i < matches.length; i++) {
      const p = join(dir, matches[i]);
      const mt = this.#fsSync.statSync(p).mtimeMs;
      if (mt > latestMtime) {
        latest = p;
        latestMtime = mt;
      }
    }
    return latest;
  }

  /**
   * Resolve briefing file for an agent
   * @param {string} agentName
   * @param {Object} agentConfig
   * @returns {string|null}
   */
  #resolveBriefingFile(agentName, agentConfig) {
    const stateDir = join(this.#cacheDir, "state");
    if (this.#fsSync.existsSync(stateDir)) {
      let prefix;
      try {
        prefix = agentNameToStatePrefix(agentName) + "_";
      } catch (err) {
        if (!(err instanceof UnsafeAgentNameError)) throw err;
        this.#log(
          JSON.stringify({
            event: "outpost.state_path.rejected",
            agent: agentName,
          }),
        );
        return null;
      }
      const found = this.#latestFileByMtime(
        stateDir,
        (f) => f.startsWith(prefix) && f.endsWith(".md"),
      );
      if (found) return found;
    }

    if (agentConfig.kb) {
      const dir = join(this.#expandPath(agentConfig.kb), "Briefings");
      if (this.#fsSync.existsSync(dir)) {
        const files = this.#fsSync
          .readdirSync(dir)
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
  async #handleStatusRequest(socket) {
    const config = await this.#loadConfig();
    const state = await this.#stateManager.load();
    const now = nowFromClock(this.#clock);
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
        ? Math.floor((this.#clock.now() - this.#daemonStartedAt) / 1000)
        : 0,
      agents,
    });
  }

  /**
   * @param {import('node:net').Socket} socket
   * @param {string} line
   */
  async #handleMessage(socket, line) {
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
      this.#requestShutdown();
      return;
    }

    if (request.type === "wake") {
      if (!request.agent) {
        this.#send(socket, { type: "error", message: "Missing agent name" });
        return;
      }
      const config = await this.#loadConfig();
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
      const state = await this.#stateManager.load();
      this.#agentRunner
        .wake(request.agent, agent, state, config.env)
        .catch(() => {});
      return;
    }

    this.#send(socket, {
      type: "error",
      message: `Unknown request type: ${request.type}`,
    });
  }

  /**
   * Tear down active children and the listening socket, then signal the daemon
   * (via `whenStopped`) that it is safe to exit. The bin owns the actual
   * `runtime.proc.exit` call (design Decision 4).
   */
  #requestShutdown() {
    this.#agentRunner.killActiveChildren();
    if (this.#server) this.#server.close();
    try {
      this.#fsSync.unlinkSync(this.#socketPath);
    } catch {}
    this.#resolveShutdown();
  }

  /**
   * Remove any existing socket file, bind the server, and register
   * SIGTERM/SIGINT handlers that request a graceful shutdown.
   * @returns {import('node:net').Server}
   */
  start() {
    try {
      this.#fsSync.unlinkSync(this.#socketPath);
    } catch {}

    this.#server = createServer((socket) => {
      let buffer = "";
      socket.on("data", (data) => {
        buffer += data.toString();
        let idx;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (line) void this.#handleMessage(socket, line);
        }
      });
      socket.on("error", () => {});
    });

    this.#server.listen(this.#socketPath, () => {
      this.#fsSync.chmodSync(this.#socketPath, 0o600);
      this.#log(`Socket server listening on ${this.#socketPath}`);
    });

    this.#server.on("error", (err) => {
      this.#log(`Socket server error: ${err.message}`);
    });

    this.#proc.on("SIGTERM", () => this.#requestShutdown());
    this.#proc.on("SIGINT", () => this.#requestShutdown());

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
      this.#fsSync.unlinkSync(this.#socketPath);
    } catch {}
  }
}

/**
 * Connect to the daemon socket and request graceful shutdown.
 * @param {string} socketPath
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 *   Injected runtime bag (uses `fsSync` and `clock`).
 * @returns {Promise<boolean>}
 */
export async function requestShutdown(socketPath, runtime) {
  if (!runtime?.fsSync) throw new Error("runtime.fsSync is required");
  if (!runtime?.clock) throw new Error("runtime.clock is required");
  const logger = createLogger("outpost", runtime);
  if (!runtime.fsSync.existsSync(socketPath)) {
    logger.info("Daemon not running (no socket).");
    return false;
  }

  return new Promise((resolve) => {
    const timeout = runtime.clock.setTimeout(() => {
      logger.info("Shutdown timed out.");
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
        runtime.clock.clearTimeout(timeout);
        logger.info("Daemon stopped.");
        socket.destroy();
        resolve(true);
      }
    });

    socket.on("error", () => {
      runtime.clock.clearTimeout(timeout);
      logger.info("Daemon not running (connection refused).");
      resolve(false);
    });

    socket.on("close", () => {
      runtime.clock.clearTimeout(timeout);
      resolve(true);
    });
  });
}
