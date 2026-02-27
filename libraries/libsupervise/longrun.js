import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

import { ProcessState } from "./state.js";

/**
 * @typedef {import("./logger.js").LogWriter} LogWriter
 */

/**
 * Configuration for LongrunProcess
 * @typedef {object} LongrunConfig
 * @property {number} [minRestartDelay] - Minimum delay before restart in ms (default: 100)
 * @property {number} [maxRestartDelay] - Maximum delay before restart in ms (default: 5000)
 * @property {number} [backoffMultiplier] - Multiplier for exponential backoff (default: 2)
 */

/**
 * Supervised longrun process, inspired by s6-supervise
 */
export class LongrunProcess extends EventEmitter {
  #name;
  #command;
  #cwd;
  #process;
  #state;
  #wantUp;
  #stdout;
  #stderr;
  #minRestartDelay;
  #maxRestartDelay;
  #backoffMultiplier;
  #currentDelay;

  /**
   * Creates a new LongrunProcess
   * @param {string} name - Service name
   * @param {string} command - Shell command to run
   * @param {object} options - Process options
   * @param {import("node:stream").Writable} options.stdout - Stream for stdout
   * @param {import("node:stream").Writable} options.stderr - Stream for stderr
   * @param {string} [options.cwd] - Working directory for the process
   * @param {LongrunConfig} [options.config] - Process configuration
   */
  constructor(name, command, options) {
    super();
    if (!name) throw new Error("name is required");
    if (!command) throw new Error("command is required");
    if (!options?.stdout) throw new Error("options.stdout is required");
    if (!options?.stderr) throw new Error("options.stderr is required");

    this.#name = name;
    this.#command = command;
    this.#cwd = options.cwd;
    this.#process = null;
    this.#state = new ProcessState();
    this.#wantUp = false;
    this.#stdout = options.stdout;
    this.#stderr = options.stderr;

    const config = options.config ?? {};
    this.#minRestartDelay = config.minRestartDelay ?? 100;
    this.#maxRestartDelay = config.maxRestartDelay ?? 5000;
    this.#backoffMultiplier = config.backoffMultiplier ?? 2;
    this.#currentDelay = this.#minRestartDelay;
  }

  /**
   * Gets the service name
   * @returns {string} Service name
   */
  get name() {
    return this.#name;
  }

  /**
   * Starts the daemon
   * @returns {Promise<void>}
   */
  async start() {
    if (this.#state.isRunning()) return;

    this.#wantUp = true;
    this.#state.resetRestartCount();
    this.#currentDelay = this.#minRestartDelay;
    await this.#spawn();
  }

  /** Spawns the daemon process */
  async #spawn() {
    this.#state.transitionTo("starting");

    // Use detached: true to create a new process group. This allows us to
    // kill the entire process tree (shell + children) with a negative PID.
    // Without this, only the bash shell receives SIGTERM and its children
    // become orphans. See: https://nodejs.org/api/child_process.html#optionsdetached
    const child = spawn("bash", ["-c", this.#command], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      cwd: this.#cwd,
      env: process.env,
    });

    this.#process = child;
    this.#state.transitionTo("starting", { pid: child.pid });

    child.stdout.pipe(this.#stdout, { end: false });
    child.stderr.pipe(this.#stderr, { end: false });

    child.on("spawn", () => {
      this.#state.transitionTo("up", { pid: child.pid });
      this.emit("up", { name: this.#name, pid: child.pid });
    });

    child.on("exit", (code, signal) => {
      this.#process = null;
      this.#handleExit(code, signal);
    });

    child.on("error", (error) => {
      this.emit("error", { name: this.#name, error });
    });
  }

  /**
   * Handles process exit
   * @param {number|null} code - Exit code
   * @param {string|null} signal - Signal that terminated the process
   */
  #handleExit(code, signal) {
    if (!this.#wantUp) {
      this.#state.transitionTo("down", { exitCode: code });
      this.emit("down", { name: this.#name, code, signal });
      return;
    }

    this.#state.transitionTo("backoff", { exitCode: code });
    this.emit("backoff", {
      name: this.#name,
      code,
      signal,
      delay: this.#currentDelay,
    });

    setTimeout(() => {
      if (this.#wantUp) {
        this.#spawn();
      }
    }, this.#currentDelay);

    this.#currentDelay = Math.min(
      this.#currentDelay * this.#backoffMultiplier,
      this.#maxRestartDelay,
    );
  }

  /**
   * Stops the daemon gracefully
   * @param {number} [timeout] - Timeout in ms before SIGKILL (default: 3000)
   * @returns {Promise<void>}
   */
  async stop(timeout = 3000) {
    this.#wantUp = false;

    if (!this.#process) {
      this.#state.transitionTo("down");
      return;
    }

    this.#state.transitionTo("stopping");

    return new Promise((resolve) => {
      const child = this.#process;
      const pid = child.pid;

      const forceKill = setTimeout(() => {
        if (this.#process === child && pid) {
          // Kill the entire process group with SIGKILL
          try {
            process.kill(-pid, "SIGKILL");
          } catch {
            // Process group may already be dead
          }
        }
      }, timeout);

      child.once("exit", () => {
        clearTimeout(forceKill);
        resolve();
      });

      // Send SIGTERM to the entire process group using negative PID.
      // This kills the shell and all its children (npm, node, etc.).
      // See: https://nodejs.org/api/child_process.html#subprocesskillsignal
      if (pid) {
        try {
          process.kill(-pid, "SIGTERM");
        } catch {
          // Process group may already be dead
        }
      }
    });
  }

  /**
   * Restarts the daemon
   * @returns {Promise<void>}
   */
  async restart() {
    await this.stop();
    await this.start();
  }

  /**
   * Sends a signal to the daemon process group
   * @param {string} sig - Signal to send (e.g., 'SIGTERM', 'SIGKILL')
   */
  signal(sig) {
    if (this.#process?.pid) {
      try {
        process.kill(-this.#process.pid, sig);
      } catch {
        // Process group may already be dead
      }
    }
  }

  /**
   * Gets the current service state
   * @returns {object} Current state
   */
  getState() {
    return this.#state.toJSON();
  }
}
