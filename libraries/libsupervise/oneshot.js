import { spawn } from "node:child_process";

/**
 * Oneshot process for one-time initialization scripts
 */
export class OneshotProcess {
  #name;
  #stdout;
  #stderr;

  /**
   * Creates a new OneshotProcess
   * @param {string} name - Service name
   * @param {object} options - Process options
   * @param {import("node:stream").Writable} options.stdout - Stream for stdout
   * @param {import("node:stream").Writable} options.stderr - Stream for stderr
   */
  constructor(name, options) {
    if (!name) throw new Error("name is required");
    if (!options?.stdout) throw new Error("options.stdout is required");
    if (!options?.stderr) throw new Error("options.stderr is required");

    this.#name = name;
    this.#stdout = options.stdout;
    this.#stderr = options.stderr;
  }

  /**
   * Gets the service name
   * @returns {string} Service name
   */
  get name() {
    return this.#name;
  }

  /**
   * Runs the up command and waits for completion
   * @param {string} command - Command to execute
   * @returns {Promise<{code: number, signal: string|null}>} Exit result
   */
  async up(command) {
    return this.#run(command);
  }

  /**
   * Runs the down command and waits for completion
   * @param {string} command - Command to execute
   * @returns {Promise<{code: number, signal: string|null}>} Exit result
   */
  async down(command) {
    return this.#run(command);
  }

  /**
   * Executes a command and waits for completion
   * @param {string} command - Command to execute
   * @returns {Promise<{code: number, signal: string|null}>} Exit result
   */
  #run(command) {
    return new Promise((resolve, reject) => {
      const child = spawn("bash", ["-c", command], {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
      });

      child.stdout.pipe(this.#stdout, { end: false });
      child.stderr.pipe(this.#stderr, { end: false });

      child.on("exit", (code, signal) => {
        resolve({ code: code ?? 0, signal });
      });

      child.on("error", (error) => {
        reject(error);
      });
    });
  }
}
