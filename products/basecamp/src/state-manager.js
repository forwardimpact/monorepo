/**
 * StateManager — load/save state.json, reset stale agents.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export class StateManager {
  #statePath;
  #fs;

  /**
   * @param {string} statePath - Path to state.json
   * @param {{ readFileSync: Function, writeFileSync: Function, mkdirSync: Function }} fs
   */
  constructor(statePath, fs) {
    if (!statePath) throw new Error("statePath is required");
    if (!fs) throw new Error("fs is required");
    this.#statePath = statePath;
    this.#fs = fs;
  }

  /**
   * Load state from disk
   * @returns {Object}
   */
  load() {
    try {
      const raw = JSON.parse(this.#fs.readFileSync(this.#statePath, "utf8"));
      if (!raw || typeof raw !== "object" || !raw.agents) {
        const state = { agents: {} };
        this.save(state);
        return state;
      }
      return raw;
    } catch {
      const state = { agents: {} };
      this.save(state);
      return state;
    }
  }

  /**
   * Save state to disk
   * @param {Object} state
   */
  save(state) {
    this.#fs.mkdirSync(dirname(this.#statePath), { recursive: true });
    this.#fs.writeFileSync(
      this.#statePath,
      JSON.stringify(state, null, 2) + "\n",
    );
  }

  /**
   * Reset agents stuck in "active" state.
   * @param {Object} state
   * @param {{ reason: string, maxAge?: number }} opts
   * @param {Function} logFn
   * @returns {number} Number of agents reset
   */
  resetStaleAgents(state, { reason, maxAge }, logFn) {
    let resetCount = 0;
    for (const [name, as] of Object.entries(state.agents)) {
      if (as.status !== "active") continue;
      if (maxAge && as.startedAt) {
        const elapsed = Date.now() - new Date(as.startedAt).getTime();
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
    if (resetCount > 0) this.save(state);
    return resetCount;
  }

  /**
   * Parse Decision:/Action: lines from agent output and update state.
   * @param {Object} agentState
   * @param {string} stdout
   * @param {string} agentName
   * @param {string} cacheDir - Cache directory for state files
   */
  updateAgentState(agentState, stdout, agentName, cacheDir) {
    const lines = stdout.split("\n");
    const decisionLine = lines.find((l) => l.startsWith("Decision:"));
    const actionLine = lines.find((l) => l.startsWith("Action:"));

    Object.assign(agentState, {
      status: "idle",
      startedAt: null,
      lastWokeAt: new Date().toISOString(),
      lastDecision: decisionLine
        ? decisionLine.slice(10).trim()
        : stdout.slice(0, 200),
      lastAction: actionLine ? actionLine.slice(8).trim() : null,
      lastError: null,
      wakeCount: (agentState.wakeCount || 0) + 1,
    });

    // Save output as briefing fallback
    const stateDir = join(cacheDir, "state");
    this.#fs.mkdirSync(stateDir, { recursive: true });
    const prefix = agentName.replace(/-/g, "_");
    this.#fs.writeFileSync(join(stateDir, `${prefix}_last_output.md`), stdout);
  }
}

/**
 * Create a StateManager with real fs dependencies
 * @param {string} statePath
 * @returns {StateManager}
 */
export function createStateManager(statePath) {
  return new StateManager(statePath, {
    readFileSync,
    writeFileSync,
    mkdirSync,
  });
}
