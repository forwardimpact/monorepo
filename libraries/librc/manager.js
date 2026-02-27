/**
 * ServiceManager for service lifecycle management.
 * Manages services through the svscan supervision daemon.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SVSCAN_BIN =
  require.resolve("@forwardimpact/libsupervise/bin/fit-svscan.js");

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
 * @property {typeof import("node:fs")} [fs] - File system module
 * @property {typeof import("node:child_process").spawn} [spawn] - Spawn function
 * @property {typeof import("node:child_process").execSync} [execSync] - ExecSync function
 * @property {typeof process} [process] - Process module
 * @property {function(string, object): Promise<object>} [sendCommand] - Socket command sender
 * @property {function(string, number): Promise<boolean>} [waitForSocket] - Socket waiter
 */

/**
 * Service lifecycle manager that communicates with svscan daemon.
 */
export class ServiceManager {
  #config;
  #logger;
  #fs;
  #spawn;
  #execSync;
  #process;
  #sendCommand;
  #waitForSocket;

  /**
   * Creates a new ServiceManager
   * @param {InitConfig} config - Init configuration
   * @param {Logger} logger - Logger instance
   * @param {Dependencies} [deps] - Injectable dependencies
   */
  constructor(config, logger, deps = {}) {
    if (!config) throw new Error("config is required");
    if (!logger) throw new Error("logger is required");

    this.#config = config;
    this.#logger = logger;
    this.#fs = deps.fs ?? fs;
    this.#spawn = deps.spawn ?? spawn;
    this.#execSync = deps.execSync ?? execSync;
    this.#process = deps.process ?? process;
    this.#sendCommand = deps.sendCommand;
    this.#waitForSocket = deps.waitForSocket;
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
      this.#process.kill(pid, 0);
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
        env: this.#process.env,
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
   * @returns {Promise<void>}
   */
  async runOneshot(name, cmd, direction) {
    this.#logger.info(name, "Running oneshot", { direction, cmd });
    try {
      this.#execSync(cmd, { stdio: "inherit", shell: true });
      this.#logger.info(name, "Oneshot completed", { direction });
    } catch (err) {
      this.#logger.error(name, "Oneshot failed", {
        direction,
        exit: err.status,
      });
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
   * Gets services to start: from first up to and including target.
   * @param {string} [serviceName] - Target service (all if omitted)
   * @returns {ServiceConfig[]} Services in start order
   */
  #getServicesToStart(serviceName) {
    const services = this.#config.init.services;
    if (!serviceName) return services;
    const index = this.#findServiceIndex(serviceName);
    return services.slice(0, index + 1);
  }

  /**
   * Gets services to stop: from target to last, in reverse order.
   * @param {string} [serviceName] - Target service (all if omitted)
   * @returns {ServiceConfig[]} Services in stop order (reversed)
   */
  #getServicesToStop(serviceName) {
    const services = this.#config.init.services;
    if (!serviceName) return [...services].reverse();
    const index = this.#findServiceIndex(serviceName);
    return services.slice(index).reverse();
  }

  /**
   * Starts configured services.
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

    if (!this.isSvscanRunning()) {
      this.#logger.debug("svscan", "Starting daemon");
      await this.spawnSvscan();
    }

    for (const svc of services) {
      if (svc.type === "oneshot") {
        if (svc.up) await this.runOneshot(svc.name, svc.up, "up");
      } else {
        this.#logger.debug(svc.name, "Starting service");
        const response = await this.#sendCommand(paths.socketPath, {
          command: "add",
          name: svc.name,
          cmd: svc.command,
          cwd: this.#config.rootDir,
        });
        if (response.ok) {
          this.#logger.info(svc.name, "Service started");
        } else if (response.error?.includes("already exists")) {
          this.#logger.info(svc.name, "Service started");
        } else {
          this.#logger.error(svc.name, "Add failed", { error: response.error });
        }
      }
    }
  }

  /**
   * Stops running services.
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
        if (svc.down) await this.runOneshot(svc.name, svc.down, "down");
      } else {
        try {
          const response = await this.#sendCommand(paths.socketPath, {
            command: "remove",
            name: svc.name,
          });
          if (!response.ok) {
            this.#logger.error(svc.name, "Remove failed", {
              error: response.error,
            });
          }
        } catch {
          // Service not supervised, ignore
        }
      }
    }

    if (!serviceName) {
      this.#logger.debug("svscan", "Stopping daemon");
      try {
        await this.#sendCommand(paths.socketPath, { command: "shutdown" });
      } catch {
        // Expected - connection closes on shutdown
      }
      try {
        this.#fs.unlinkSync(paths.socketPath);
      } catch {
        // Ignore
      }
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
}
