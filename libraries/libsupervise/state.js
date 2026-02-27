/**
 * Valid process states
 * @typedef {"down"|"starting"|"up"|"stopping"|"backoff"} State
 */

/**
 * Process state tracking
 */
export class ProcessState {
  #state;
  #pid;
  #startedAt;
  #restartCount;
  #lastExitCode;

  /** Creates a new ProcessState instance */
  constructor() {
    this.#state = "down";
    this.#pid = null;
    this.#startedAt = null;
    this.#restartCount = 0;
    this.#lastExitCode = null;
  }

  /**
   * Transitions the service to a new state
   * @param {State} state - Target state
   * @param {object} [context] - Optional context for the transition
   * @param {number} [context.pid] - Process ID
   * @param {number} [context.exitCode] - Exit code
   */
  transitionTo(state, context = {}) {
    this.#state = state;

    if (state === "starting" && context.pid) {
      this.#pid = context.pid;
      this.#startedAt = Date.now();
    }

    if (state === "up" && context.pid) {
      this.#pid = context.pid;
    }

    if (state === "down") {
      this.#pid = null;
      if (context.exitCode !== undefined) {
        this.#lastExitCode = context.exitCode;
      }
    }

    if (state === "backoff") {
      this.#pid = null;
      this.#restartCount++;
      if (context.exitCode !== undefined) {
        this.#lastExitCode = context.exitCode;
      }
    }
  }

  /**
   * Gets the current state
   * @returns {State} Current state
   */
  getState() {
    return this.#state;
  }

  /**
   * Gets the current process ID
   * @returns {number|null} Current PID or null if not running
   */
  getPid() {
    return this.#pid;
  }

  /**
   * Gets the restart count
   * @returns {number} Number of restarts since last manual start
   */
  getRestartCount() {
    return this.#restartCount;
  }

  /** Resets the restart count */
  resetRestartCount() {
    this.#restartCount = 0;
  }

  /**
   * Checks if the service is in a running state
   * @returns {boolean} True if starting or up
   */
  isRunning() {
    return this.#state === "starting" || this.#state === "up";
  }

  /**
   * Serializes state for status queries
   * @returns {object} Serialized state
   */
  toJSON() {
    return {
      state: this.#state,
      pid: this.#pid,
      startedAt: this.#startedAt,
      restartCount: this.#restartCount,
      lastExitCode: this.#lastExitCode,
    };
  }
}
