/**
 * StateManager — load/save state.json, reset stale agents.
 */

import { dirname, join } from "node:path";
import { isoTimestamp } from "@forwardimpact/libutil";
import { agentNameToStatePrefix, UnsafeAgentNameError } from "./agent-path.js";

/** Persist and query agent scheduler state from a JSON file on disk. */
export class StateManager {
  #statePath;
  #fs;
  #clock;

  /**
   * @param {string} statePath - Path to state.json
   * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
   *   Injected runtime bag (uses `fs` (async) and `clock`).
   */
  constructor(statePath, runtime) {
    if (!statePath) throw new Error("statePath is required");
    if (!runtime?.fs) throw new Error("runtime.fs is required");
    if (!runtime?.clock) throw new Error("runtime.clock is required");
    this.#statePath = statePath;
    this.#fs = runtime.fs;
    this.#clock = runtime.clock;
  }

  /**
   * Read and parse state from disk; on any read or parse error, write a fresh
   * empty state and return it.
   * @returns {Promise<Object>}
   */
  async load() {
    try {
      const raw = JSON.parse(await this.#fs.readFile(this.#statePath, "utf8"));
      if (!raw || typeof raw !== "object" || !raw.agents) {
        const state = { agents: {} };
        await this.save(state);
        return state;
      }
      return raw;
    } catch {
      const state = { agents: {} };
      await this.save(state);
      return state;
    }
  }

  /**
   * Save state to disk
   * @param {Object} state
   * @returns {Promise<void>}
   */
  async save(state) {
    await this.#fs.mkdir(dirname(this.#statePath), { recursive: true });
    await this.#fs.writeFile(
      this.#statePath,
      JSON.stringify(state, null, 2) + "\n",
    );
  }

  /**
   * Reset agents stuck in "active" state.
   * @param {Object} state
   * @param {{ reason: string, maxAge?: number }} opts
   * @param {Function} logFn
   * @returns {Promise<number>} Number of agents reset
   */
  async resetStaleAgents(state, { reason, maxAge }, logFn) {
    let resetCount = 0;
    for (const [name, as] of Object.entries(state.agents)) {
      if (as.status !== "active") continue;
      if (maxAge && as.startedAt) {
        const elapsed = this.#clock.now() - Date.parse(as.startedAt);
        if (elapsed < maxAge) continue;
      }
      logFn(`Resetting stale agent: ${name} (${reason})`);
      Object.assign(as, {
        status: "interrupted",
        startedAt: null,
        lastError: reason,
      });
      resetCount++;
    }
    if (resetCount > 0) await this.save(state);
    return resetCount;
  }

  /**
   * Parse Decision:/Action: lines from agent output and update state.
   * @param {Object} agentState
   * @param {string} stdout
   * @param {string} agentName
   * @param {string} cacheDir - Cache directory for state files
   * @param {Function} [logFn] - Optional logger for rejection records
   * @returns {Promise<void>}
   */
  async updateAgentState(agentState, stdout, agentName, cacheDir, logFn) {
    const lines = stdout.split("\n");
    const decisionLine = lines.find((l) => l.startsWith("Decision:"));
    const actionLine = lines.find((l) => l.startsWith("Action:"));

    Object.assign(agentState, {
      status: "idle",
      startedAt: null,
      lastWokeAt: isoTimestamp(this.#clock.now()),
      lastDecision: decisionLine
        ? decisionLine.slice(10).trim()
        : stdout.slice(0, 200),
      lastAction: actionLine ? actionLine.slice(8).trim() : null,
      lastError: null,
      wakeCount: (agentState.wakeCount || 0) + 1,
    });

    // Save output as briefing fallback
    const stateDir = join(cacheDir, "state");
    let prefix;
    try {
      prefix = agentNameToStatePrefix(agentName);
    } catch (err) {
      if (!(err instanceof UnsafeAgentNameError)) throw err;
      if (logFn)
        logFn(
          JSON.stringify({
            event: "outpost.state_path.rejected",
            agent: agentName,
          }),
        );
      return;
    }
    await this.#fs.mkdir(stateDir, { recursive: true });
    await this.#fs.writeFile(
      join(stateDir, `${prefix}_last_output.md`),
      stdout,
    );
  }
}
