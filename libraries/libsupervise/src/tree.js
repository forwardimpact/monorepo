import { createRequire } from "node:module";
import path from "node:path";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";

import { LIBCLI_IS_COMPILED } from "@forwardimpact/libcli";

import { LongrunProcess } from "./longrun.js";

/**
 * @typedef {object} TreeConfig
 * @property {number} [shutdownTimeout] - Timeout for graceful shutdown in ms (default: 3000)
 * @property {import('@forwardimpact/libtelemetry').Logger} logger - Logger instance
 */

/**
 * Supervision tree managing multiple processes, inspired by s6-svscan
 */
export class SupervisionTree extends EventEmitter {
  #runtime;
  #subprocess;
  #clock;
  #logDir;
  #shutdownTimeout;
  #longruns;
  #logProcesses;
  #running;
  #logger;
  #isCompiled;
  #loggerCmd;

  /**
   * Creates a new SupervisionTree
   * @param {string} logDir - Base directory for process logs
   * @param {object} config - Tree configuration
   * @param {import("@forwardimpact/libutil/runtime").Runtime} config.runtime
   *   Injected runtime bag (uses `subprocess`, `clock`; threaded into children).
   * @param {number} [config.shutdownTimeout] - Timeout for graceful shutdown in ms (default: 3000)
   * @param {import('@forwardimpact/libtelemetry').Logger} config.logger - Logger instance
   * @param {boolean} [config.isCompiled] - Whether the host is a
   *   `bun build --compile` binary; defaults to libcli's `LIBCLI_IS_COMPILED`.
   *   Selects how the `fit-logger` child is launched (see {@link #loggerCommand});
   *   injectable so tests can exercise both branches without a real binary.
   */
  constructor(logDir, config) {
    super();
    if (!logDir) throw new Error("logDir is required");
    if (!config?.runtime?.subprocess)
      throw new Error("config.runtime is required");
    if (!config?.logger) throw new Error("config.logger is required");

    this.#runtime = config.runtime;
    this.#subprocess = config.runtime.subprocess;
    this.#clock = config.runtime.clock;
    this.#logDir = logDir;
    this.#shutdownTimeout = config.shutdownTimeout ?? 3000;
    this.#logger = config.logger;
    this.#longruns = new Map();
    this.#logProcesses = new Map();
    this.#running = false;
    this.#isCompiled = config.isCompiled ?? LIBCLI_IS_COMPILED;
  }

  /**
   * Resolve the command + base args used to launch the `fit-logger` child,
   * daemontools-style: svscan execs a separate logger program per supervised
   * service (like s6-svscan exec'ing s6-log) and pipes the service's output
   * into its stdin.
   *
   * A compiled install ships `fit-logger` alongside `fit-svscan` on PATH, so it
   * is launched by bare name and resolved by the OS — the same way s6 run
   * scripts invoke their logger. In source/npx execution there is no installed
   * binary, so the entry module is run under `node`; the `require.resolve` stays
   * inside this branch (and lazy) so it never runs in a compiled binary, where
   * the `../bin/fit-logger.js` path does not exist on the `$bunfs`.
   * @returns {{command: string, baseArgs: string[]}}
   */
  #loggerCommand() {
    if (this.#loggerCmd) return this.#loggerCmd;
    this.#loggerCmd = this.#isCompiled
      ? { command: "fit-logger", baseArgs: [] }
      : {
          command: "node",
          baseArgs: [
            createRequire(import.meta.url).resolve("../bin/fit-logger.js"),
          ],
        };
    return this.#loggerCmd;
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
      runtime: this.#runtime,
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
    this.#logger.info(name, "Process added to supervision", {
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
    const { command, baseArgs } = this.#loggerCommand();
    const logProcess = this.#subprocess.spawn(
      command,
      [...baseArgs, "--dir", logDir],
      {
        stdio: ["pipe", "inherit", "inherit"],
      },
    );

    // Pipe streams to log process stdin (with end: false so pipe survives
    // restarts). `stdin` is the child's writable from the spawn contract.
    if (logProcess.stdin) {
      stdout.pipe(logProcess.stdin, { end: false });
      stderr.pipe(logProcess.stdin, { end: false });
    }

    // Supervise: restart on unexpected exit. The exit event is the resolution
    // of the exitCode/signal promises from the spawn contract.
    void Promise.all([logProcess.exitCode, logProcess.signal]).then(
      ([code, signal]) => {
        // Only restart if tree is still running and process entry exists
        if (this.#running && this.#longruns.has(name)) {
          this.emit("log:down", { name, code, signal });
          // Respawn after a short delay
          this.#clock.setTimeout(() => {
            if (this.#running && this.#longruns.has(name)) {
              this.#spawnLogProcess(name, logDir, stdout, stderr);
              this.emit("log:up", { name });
            }
          }, 100);
        }
      },
    );

    if (logProcess.pid === undefined) {
      this.emit("log:error", {
        name,
        error: new Error(`failed to spawn log process for ${name}`),
      });
    }

    this.#logProcesses.set(name, logProcess);
    this.#logger.debug(name, "Log writer added to supervision", {
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

    this.#logger.info(name, "Process removed from supervision", {
      pid: entry.longrun.getState().pid,
    });

    await entry.longrun.stop(this.#shutdownTimeout);
    entry.stdout.end();
    entry.stderr.end();

    this.#longruns.delete(name);

    const logProcess = this.#logProcesses.get(name);
    if (logProcess) {
      this.#logger.debug(name, "Removing log writer from supervision", {
        pid: logProcess.pid,
      });
      logProcess.stdin?.end();
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
