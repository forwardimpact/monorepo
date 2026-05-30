/**
 * Service lifecycle manager that communicates with a svscan supervision
 * daemon over a Unix socket.
 *
 * ## Declaration-order contract
 *
 * The `init.services` array in config.json doubles as a dependency graph.
 * Earlier entries are treated as infrastructure that later entries depend
 * on (e.g. tunnels before bridges). Three operations exploit this ordering:
 *
 *   start(name)   — bring up [first … name]      (dependencies, then target)
 *   stop(name)    — tear down [name … last]       (dependents, then target — reversed)
 *   restart(name) — stop [name … last], start [name … last]
 *
 * `restart` intentionally does NOT re-run `start(name)`, because start's
 * scope ([first … name]) would miss dependents that stop just tore down.
 * Instead it starts the same [name … last] slice that was stopped.
 */
import path from "node:path";
import { createRequire } from "node:module";
import { pipeline } from "node:stream/promises";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

const require = createRequire(import.meta.url);
const SVSCAN_BIN = require.resolve(
  "@forwardimpact/libsupervise/bin/fit-svscan.js",
);

// Lazily constructed so that test code importing this module does not
// trigger the real-fs side-effects of createDefaultRuntime at import time.
let _defaultRuntime;
function getDefaultRuntime() {
  if (!_defaultRuntime) _defaultRuntime = createDefaultRuntime();
  return _defaultRuntime;
}

/**
 * @typedef {object} RuntimePaths
 * @property {string} socketPath - Path to Unix socket
 * @property {string} pidFile - Path to PID file
 * @property {string} logFile - Path to log file
 */

/**
 * @typedef {object} ServiceConfig
 * @property {string} name - Service name
 * @property {string} [type] - Service type ("oneshot" or "longrun")
 * @property {string} [command] - Command to run for longrun services
 * @property {string} [up] - Command to run on start for oneshot services
 * @property {string} [down] - Command to run on stop for oneshot services
 * @property {boolean} [optional] - When true, skip with warning on failure
 */

/**
 * @typedef {object} InitConfig
 * @property {string} rootDir - Project root directory
 * @property {object} init - Init configuration
 * @property {string} init.log_dir - Log directory path
 * @property {ServiceConfig[]} init.services - Service definitions
 */

/**
 * @typedef {object} Logger
 * @property {Function} debug - Debug logging
 * @property {Function} info - Info logging
 * @property {Function} error - Error logging
 */

/**
 * @typedef {object} Dependencies
 * @property {typeof import("node:fs")} [fs] - File system module (sync surface).
 *   BC shim: superseded by `runtime.fsSync` when a `runtime` bag is injected.
 * @property {typeof import("node:child_process").spawn} [spawn] - Spawn function.
 *   In production wire from the bin (which is allowed to import child_process).
 * @property {typeof import("node:child_process").execSync} [execSync] - ExecSync function.
 *   In production wire from the bin (which is allowed to import child_process).
 * @property {function(string, object): Promise<object>} [sendCommand] - Socket command sender
 * @property {function(string, number): Promise<boolean>} [waitForSocket] - Socket waiter
 * @property {NodeJS.WritableStream} [stdout] - Stdout sink for `logs()`'s
 *   `pipeline()`; defaults to the ambient `process.stdout` because
 *   `runtime.proc.stdout` is a `{ write }` shim, not a pipeline-grade
 *   `Writable` (see MONOREPO teardown § foundation surface gaps).
 * @property {import("@forwardimpact/libutil/runtime").Runtime} [runtime] - Runtime bag.
 *   Supplies the sync-fs (`fsSync`) and process (`proc`, including `kill` and
 *   `env`) surfaces; `deps.fs` overrides `fsSync` when present.
 */

/**
 *
 */
export class ServiceManager {
  #config;
  #logger;
  #fs;
  #spawn;
  #execSync;
  #proc;
  #sendCommand;
  #waitForSocket;
  #stdout;

  /**
   * Creates a new ServiceManager
   * @param {InitConfig} config - Init configuration
   * @param {Logger} logger - Logger instance
   * @param {Dependencies} [deps] - Injectable dependencies
   */
  constructor(config, logger, deps = {}) {
    if (!config) throw new Error("config is required");
    if (!logger) throw new Error("logger is required");

    const runtime = deps.runtime ?? getDefaultRuntime();

    this.#config = config;
    this.#logger = logger;
    // deps.fs (legacy sync-fs override) > runtime.fsSync
    this.#fs = deps.fs ?? runtime.fsSync;
    // spawn and execSync must be provided by the caller (bin or test); there
    // is no runtime-level equivalent that covers detached stdio-redirect
    // spawning. Fail fast with a clear message rather than a late TypeError
    // when start()/status() first dereferences them.
    if (!deps.spawn || !deps.execSync) {
      throw new Error(
        "ServiceManager requires deps.spawn and deps.execSync (the bin injects them from node:child_process)",
      );
    }
    this.#spawn = deps.spawn;
    this.#execSync = deps.execSync;
    // proc supplies kill() (liveness probe) and env (child env) via the
    // injected runtime — no ambient `process` fallback.
    this.#proc = runtime.proc;
    this.#sendCommand = deps.sendCommand;
    this.#waitForSocket = deps.waitForSocket;
    // logs() pipes a read stream into a Writable; runtime.proc.stdout is a
    // `{ write }` shim, not pipeline-grade, so this stays on the ambient
    // stream until the runtime surface grows a writable stdout (teardown).
    this.#stdout = deps.stdout ?? process.stdout;
  }

  /**
   * Gets runtime file paths for supervision daemon.
   * @returns {RuntimePaths} Runtime paths
   */
  getRuntimePaths() {
    return {
      socketPath: path.join(this.#config.rootDir, "data", "svscan.sock"),
      pidFile: path.join(this.#config.rootDir, "data", "svscan.pid"),
      logFile: path.join(this.#config.rootDir, "data", "svscan.log"),
    };
  }

  /**
   * Checks if svscan daemon is running.
   * @returns {boolean} True if svscan is running
   */
  isSvscanRunning() {
    const paths = this.getRuntimePaths();
    let pid;
    try {
      pid = parseInt(this.#fs.readFileSync(paths.pidFile, "utf8").trim(), 10);
    } catch {
      return false;
    }
    try {
      // Signal 0 tests whether the process exists without actually signalling it.
      this.#proc.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Spawns svscan daemon in background.
   * @returns {Promise<void>}
   */
  async spawnSvscan() {
    const paths = this.getRuntimePaths();
    const logDir = path.resolve(
      this.#config.rootDir,
      this.#config.init.log_dir,
    );

    this.#fs.mkdirSync(logDir, { recursive: true });
    this.#logger.debug("svscan", "Spawning svscan", {
      socket: paths.socketPath,
      log_dir: logDir,
    });

    const logFd = this.#fs.openSync(paths.logFile, "a");
    const child = this.#spawn(
      "node",
      [
        SVSCAN_BIN,
        "--socket",
        paths.socketPath,
        "--pid",
        paths.pidFile,
        "--logdir",
        logDir,
      ],
      {
        detached: true,
        stdio: ["ignore", logFd, logFd],
        env: this.#proc.env,
      },
    );
    child.unref();
    this.#fs.closeSync(logFd);

    const ready = await this.#waitForSocket(paths.socketPath, 5000);
    if (!ready) {
      this.#logger.error("svscan", "svscan failed to start", {
        socket: paths.socketPath,
      });
      throw new Error("svscan failed to start");
    }
    this.#logger.debug("svscan", "Socket ready", { socket: paths.socketPath });
  }

  /**
   * Executes a oneshot command for service lifecycle.
   * @param {string} name - Service name
   * @param {string} cmd - Command to execute
   * @param {"up"|"down"} direction - Lifecycle direction
   * @param {{ optional?: boolean }} [opts]
   * @returns {Promise<void>}
   */
  async runOneshot(name, cmd, direction, { optional = false } = {}) {
    const timeoutMs = optional ? 30_000 : 120_000;
    this.#logger.info(name, "Running oneshot", { direction, cmd });
    try {
      this.#execSync(cmd, {
        stdio: "inherit",
        shell: true,
        timeout: timeoutMs,
      });
      this.#logger.info(name, "Oneshot completed", { direction });
    } catch (err) {
      if (err.killed) {
        this.#logger.error(name, "Oneshot timed out", {
          direction,
          timeout_ms: timeoutMs,
        });
      } else {
        this.#logger.error(name, "Oneshot failed", {
          direction,
          exit: err.status,
        });
      }
      throw err;
    }
  }

  /**
   * Finds index of named service, throws if not found.
   * @param {string} serviceName - Service name to find
   * @returns {number} Index in services array
   */
  #findServiceIndex(serviceName) {
    const index = this.#config.init.services.findIndex(
      (s) => s.name === serviceName,
    );
    if (index === -1) {
      throw new Error(`Unknown service: ${serviceName}`);
    }
    return index;
  }

  /**
   * Start scope: [first … target] in declaration order.
   * Everything before the target is a dependency that must be up first.
   * @param {string} [serviceName] - Target service (all if omitted)
   * @returns {ServiceConfig[]}
   */
  #getServicesToStart(serviceName) {
    const services = this.#config.init.services;
    if (!serviceName) return services;
    const index = this.#findServiceIndex(serviceName);
    return services.slice(0, index + 1);
  }

  /**
   * Stop scope: [target … last] in reverse declaration order.
   * Everything after the target depends on it and must come down first.
   * Reversed so dependents stop before the thing they depend on.
   * @param {string} [serviceName] - Target service (all if omitted)
   * @returns {ServiceConfig[]}
   */
  #getServicesToStop(serviceName) {
    const services = this.#config.init.services;
    if (!serviceName) return [...services].reverse();
    const index = this.#findServiceIndex(serviceName);
    return services.slice(index).reverse();
  }

  /**
   * Shuts down a running svscan daemon and removes its socket.
   * @param {string} socketPath - Path to the svscan socket
   * @returns {Promise<void>}
   */
  async #shutdownSvscan(socketPath) {
    try {
      await this.#sendCommand(socketPath, { command: "shutdown" });
    } catch {
      // The daemon closes the socket as part of shutting down, so the
      // send always fails with a connection-reset — that IS the success signal.
    }
    try {
      this.#fs.unlinkSync(socketPath);
    } catch {
      // Socket file may already be gone if the daemon cleaned up first.
    }
  }

  /**
   * Starts a oneshot service. Returns true if the service was skipped
   * (optional and failed), false otherwise. Throws on non-optional failure.
   * @param {ServiceConfig} svc - Service configuration
   * @returns {Promise<boolean>} True if skipped
   */
  async #startOneshotService(svc) {
    if (!svc.up) return false;
    try {
      await this.runOneshot(svc.name, svc.up, "up", {
        optional: svc.optional,
      });
    } catch (err) {
      if (svc.optional) {
        this.#logger.info(svc.name, "Optional service skipped (not available)");
        return true;
      }
      throw err;
    }
    return false;
  }

  /**
   * Starts a longrun service via the svscan daemon.
   * @param {ServiceConfig} svc - Service configuration
   * @param {string} socketPath - Path to the svscan socket
   * @returns {Promise<void>}
   */
  async #startLongrunService(svc, socketPath) {
    this.#logger.debug(svc.name, "Starting service");
    const response = await this.#sendCommand(socketPath, {
      command: "add",
      name: svc.name,
      cmd: svc.command,
      cwd: this.#config.rootDir,
    });
    // "already exists" means svscan is already supervising it — idempotent success.
    if (response.ok || response.error?.includes("already exists")) {
      this.#logger.info(svc.name, "Service started");
    } else if (svc.optional) {
      this.#logger.info(svc.name, "Optional service skipped", {
        error: response.error,
      });
    } else {
      this.#logger.error(svc.name, "Add failed", { error: response.error });
    }
  }

  /**
   * Start services from first through target (bringing up dependencies).
   * Idempotent for services already supervised by svscan.
   * @param {string} [serviceName] - Target service (starts first through target)
   * @returns {Promise<void>}
   */
  async start(serviceName) {
    const paths = this.getRuntimePaths();
    const services = this.#getServicesToStart(serviceName);
    this.#logger.debug("start", "Starting services", {
      root_dir: this.#config.rootDir,
      target: serviceName || "all",
      count: services.length,
    });

    if (this.isSvscanRunning()) {
      // Bare `start` (no name) replaces the daemon so it picks up
      // config changes; `start <name>` reuses the running daemon
      // because we only need to add services, not reset the world.
      if (!serviceName) {
        this.#logger.debug("svscan", "Restarting daemon (fresh environment)");
        await this.#shutdownSvscan(paths.socketPath);
        this.#logger.debug("svscan", "Starting daemon");
        await this.spawnSvscan();
      }
    } else {
      this.#logger.debug("svscan", "Starting daemon");
      await this.spawnSvscan();
    }

    for (const svc of services) {
      if (svc.type === "oneshot") {
        await this.#startOneshotService(svc);
      } else {
        await this.#startLongrunService(svc, paths.socketPath);
      }
    }
  }

  /**
   * Stops a longrun service via the svscan daemon.
   * @param {ServiceConfig} svc - Service configuration
   * @param {string} socketPath - Path to the svscan socket
   * @returns {Promise<void>}
   */
  async #stopLongrunService(svc, socketPath) {
    try {
      const response = await this.#sendCommand(socketPath, {
        command: "remove",
        name: svc.name,
      });
      if (!response.ok) {
        this.#logger.error(svc.name, "Remove failed", {
          error: response.error,
        });
      }
    } catch {
      // Throws when the service was never added to svscan — harmless
      // during teardown of services that weren't running.
    }
  }

  /**
   * Restart scope: stop [name … last], then start [name … last].
   *
   * This deliberately does NOT delegate to `start(name)` for the
   * start phase. `start(name)` brings up [first … name] (the
   * dependency prefix), which would leave dependents — the services
   * after the target that `stop` just tore down — dead. Instead we
   * start the same [name … last] slice so every stopped service
   * comes back.
   *
   * Dependencies before the target are left untouched throughout.
   *
   * @param {string} [serviceName] - Target service (all if omitted)
   * @returns {Promise<void>}
   */
  async restart(serviceName) {
    await this.stop(serviceName);
    if (!serviceName) {
      await this.start();
      return;
    }
    const paths = this.getRuntimePaths();
    const services = this.#config.init.services;
    const index = this.#findServiceIndex(serviceName);
    // Same forward slice that stop used (stop reversed it for teardown order).
    const toStart = services.slice(index);
    if (!this.isSvscanRunning()) {
      await this.spawnSvscan();
    }
    for (const svc of toStart) {
      if (svc.type === "oneshot") {
        await this.#startOneshotService(svc);
      } else {
        await this.#startLongrunService(svc, paths.socketPath);
      }
    }
  }

  /**
   * Stop services from target through last (tearing down dependents first).
   * Bare `stop` (no name) also shuts down the svscan daemon itself;
   * `stop <name>` leaves the daemon running so surviving services
   * keep their supervisor.
   * @param {string} [serviceName] - Target service (stops target through last)
   * @returns {Promise<void>}
   */
  async stop(serviceName) {
    const paths = this.getRuntimePaths();
    const services = this.#getServicesToStop(serviceName);
    this.#logger.debug("stop", "Stopping services", {
      root_dir: this.#config.rootDir,
      target: serviceName || "all",
      count: services.length,
    });

    if (!this.isSvscanRunning()) {
      this.#logger.info("svscan", "Not running");
      return;
    }

    for (const svc of services) {
      if (svc.type === "oneshot") {
        if (svc.down)
          await this.runOneshot(svc.name, svc.down, "down", {
            optional: svc.optional,
          });
      } else {
        await this.#stopLongrunService(svc, paths.socketPath);
      }
    }

    if (!serviceName) {
      this.#logger.debug("svscan", "Stopping daemon");
      await this.#shutdownSvscan(paths.socketPath);
    }
  }

  /**
   * Shows status of configured services.
   * @param {string} [serviceName] - Target service (shows all if omitted)
   * @returns {Promise<void>}
   */
  async status(serviceName) {
    const paths = this.getRuntimePaths();

    if (serviceName) {
      this.#findServiceIndex(serviceName); // Validate service exists
    }

    if (!this.isSvscanRunning()) {
      this.#logger.info("svscan", "Not running");
      return;
    }

    try {
      const response = await this.#sendCommand(paths.socketPath, {
        command: "status",
      });
      this.#logger.info("svscan", "Running");
      if (Object.keys(response.services).length === 0) {
        this.#logger.info("status", "No services supervised");
        return;
      }
      for (const [name, info] of Object.entries(response.services)) {
        if (!serviceName || name === serviceName) {
          this.#logger.info(name, info.state || "unknown", {
            pid: info.pid || "-",
          });
        }
      }
    } catch (err) {
      this.#logger.error("status", "Failed to get status", {
        error: err.message,
      });
    }
  }

  /**
   * Emits the contents of a service's current log file to stdout.
   * @param {string} serviceName - Service name (required)
   * @returns {Promise<void>}
   */
  async logs(serviceName) {
    this.#findServiceIndex(serviceName); // throws "Unknown service: <name>"
    const logPath = path.join(
      this.#config.rootDir,
      this.#config.init.log_dir,
      serviceName,
      "current",
    );
    const source = this.#fs.createReadStream(logPath);
    try {
      await pipeline(source, this.#stdout, { end: false });
    } catch (err) {
      if (err.code === "ENOENT") return;
      throw err;
    }
  }
}
