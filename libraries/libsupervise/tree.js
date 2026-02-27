import { createRequire } from "node:module";
import path from "node:path";
import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";

import { createLogger } from "@forwardimpact/libtelemetry";

import { LongrunProcess } from "./longrun.js";

const logger = createLogger("tree");

const require = createRequire(import.meta.url);
const LOG_BIN = require.resolve("./bin/fit-logger.js");

/**
 * @typedef {object} TreeConfig
 * @property {number} [shutdownTimeout] - Timeout for graceful shutdown in ms (default: 3000)
 */

/**
 * Supervision tree managing multiple processes, inspired by s6-svscan
 */
export class SupervisionTree extends EventEmitter {
  #logDir;
  #shutdownTimeout;
  #longruns;
  #logProcesses;
  #running;

  /**
   * Creates a new SupervisionTree
   * @param {string} logDir - Base directory for process logs
   * @param {TreeConfig} [config] - Tree configuration
   */
  constructor(logDir, config = {}) {
    super();
    if (!logDir) throw new Error("logDir is required");

    this.#logDir = logDir;
    this.#shutdownTimeout = config.shutdownTimeout ?? 3000;
    this.#longruns = new Map();
    this.#logProcesses = new Map();
    this.#running = false;
  }

  /**
   * Starts the supervision tree
   * @returns {Promise<void>}
   */
  async start() {
    this.#running = true;
    this.emit("start");
  }

  /**
   * Stops the supervision tree and all services
   * @returns {Promise<void>}
   */
  async stop() {
    this.#running = false;

    const names = Array.from(this.#longruns.keys()).reverse();
    for (const name of names) {
      await this.remove(name);
    }

    this.emit("stop");
  }

  /**
   * Adds and starts a new supervised process
   * @param {string} name - Process name
   * @param {string} command - Shell command to run
   * @param {object} [options] - Add options
   * @param {string} [options.cwd] - Working directory for the process
   * @returns {Promise<void>}
   */
  async add(name, command, options = {}) {
    if (this.#longruns.has(name)) {
      throw new Error(`Process ${name} already exists`);
    }

    const processLogDir = path.join(this.#logDir, name);

    // Create PassThrough streams that the tree holds - these survive log process restarts
    const stdout = new PassThrough();
    const stderr = new PassThrough();

    // Spawn and supervise the log process
    this.#spawnLogProcess(name, processLogDir, stdout, stderr);

    const longrun = new LongrunProcess(name, command, {
      stdout,
      stderr,
      cwd: options.cwd,
    });

    longrun.on("up", (event) => this.emit("process:up", event));
    longrun.on("down", (event) => this.emit("process:down", event));
    longrun.on("backoff", (event) => this.emit("process:backoff", event));
    longrun.on("error", (event) => this.emit("process:error", event));

    this.#longruns.set(name, { longrun, stdout, stderr });

    await longrun.start();
    logger.info(name, "Process added to supervision", {
      pid: longrun.getState().pid,
    });
  }

  /**
   * Spawns a supervised log process for a named process
   * @param {string} name - Process name
   * @param {string} logDir - Log directory path
   * @param {PassThrough} stdout - Stdout stream to pipe from
   * @param {PassThrough} stderr - Stderr stream to pipe from
   */
  #spawnLogProcess(name, logDir, stdout, stderr) {
    const logProcess = spawn("node", [LOG_BIN, "--dir", logDir], {
      stdio: ["pipe", "inherit", "inherit"],
    });

    // Pipe streams to log process stdin (with end: false so pipe survives restarts)
    stdout.pipe(logProcess.stdin, { end: false });
    stderr.pipe(logProcess.stdin, { end: false });

    // Supervise: restart on unexpected exit
    logProcess.on("exit", (code, signal) => {
      // Only restart if tree is still running and process entry exists
      if (this.#running && this.#longruns.has(name)) {
        this.emit("log:down", { name, code, signal });
        // Respawn after a short delay
        setTimeout(() => {
          if (this.#running && this.#longruns.has(name)) {
            this.#spawnLogProcess(name, logDir, stdout, stderr);
            this.emit("log:up", { name });
          }
        }, 100);
      }
    });

    logProcess.on("error", (error) => {
      this.emit("log:error", { name, error });
    });

    this.#logProcesses.set(name, logProcess);
    logger.debug(name, "Log writer added to supervision", {
      pid: logProcess.pid,
    });
  }

  /**
   * Stops and removes a process
   * @param {string} name - Process name
   * @returns {Promise<void>}
   */
  async remove(name) {
    const entry = this.#longruns.get(name);
    if (!entry) return;

    logger.info(name, "Process removed from supervision", {
      pid: entry.longrun.getState().pid,
    });

    await entry.longrun.stop(this.#shutdownTimeout);
    entry.stdout.end();
    entry.stderr.end();

    this.#longruns.delete(name);

    const logProcess = this.#logProcesses.get(name);
    if (logProcess) {
      logger.debug(name, "Removing log writer from supervision", {
        pid: logProcess.pid,
      });
      logProcess.stdin.end();
      logProcess.kill("SIGTERM");
      this.#logProcesses.delete(name);
    }
  }

  /**
   * Gets the longrun process for a service
   * @param {string} name - Service name
   * @returns {LongrunProcess|undefined} Longrun process instance
   */
  get(name) {
    return this.#longruns.get(name)?.longrun;
  }

  /**
   * Gets the status of all services
   * @returns {object} Map of service names to states
   */
  getStatus() {
    const status = {};
    for (const [name, entry] of this.#longruns) {
      status[name] = entry.longrun.getState();
    }
    return status;
  }

  /**
   * Checks if the tree is running
   * @returns {boolean} True if running
   */
  isRunning() {
    return this.#running;
  }
}
