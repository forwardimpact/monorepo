/**
 * Oneshot process for one-time initialization scripts
 */
export class OneshotProcess {
  #subprocess;
  #name;
  #stdout;
  #stderr;

  /**
   * Creates a new OneshotProcess
   * @param {string} name - Service name
   * @param {object} options - Process options
   * @param {import("@forwardimpact/libutil/runtime").Runtime} options.runtime
   *   Injected runtime bag (uses `subprocess`).
   * @param {import("node:stream").Writable} options.stdout - Stream for stdout
   * @param {import("node:stream").Writable} options.stderr - Stream for stderr
   */
  constructor(name, options) {
    if (!name) throw new Error("name is required");
    if (!options?.runtime?.subprocess)
      throw new Error("runtime.subprocess is required");
    if (!options?.stdout) throw new Error("options.stdout is required");
    if (!options?.stderr) throw new Error("options.stderr is required");

    this.#subprocess = options.runtime.subprocess;
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
  async #run(command) {
    const child = this.#subprocess.spawn("bash", ["-c", command], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    // A defined pid means the child spawned; undefined is a spawn failure
    // (the contract's analogue of the old `error` event).
    if (child.pid === undefined) {
      throw new Error(`failed to spawn oneshot ${this.#name}: ${command}`);
    }

    // Pump the child's output into the injected sinks as detached loops so
    // neither blocks the exit await.
    const pipeOut = (async () => {
      for await (const chunk of child.stdout) this.#stdout.write(chunk);
    })();
    const pipeErr = (async () => {
      for await (const chunk of child.stderr) this.#stderr.write(chunk);
    })();

    const [code, signal] = await Promise.all([child.exitCode, child.signal]);
    await Promise.all([pipeOut, pipeErr]);
    return { code: code ?? 0, signal };
  }
}
