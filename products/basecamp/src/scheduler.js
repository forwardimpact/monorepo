/**
 * Scheduler — cron matching, shouldWake logic, wake orchestration.
 */

/** Maximum time an agent can be "active" before being considered stale (35 min). */
const MAX_AGENT_RUNTIME_MS = 35 * 60_000;

// --- Cron matching (pure functions) ------------------------------------------

/**
 * @param {string} field
 * @param {number} value
 * @returns {boolean}
 */
export function matchField(field, value) {
  if (field === "*") return true;
  if (field.startsWith("*/")) return value % parseInt(field.slice(2)) === 0;
  return field.split(",").some((part) => {
    if (part.includes("-")) {
      const [lo, hi] = part.split("-").map(Number);
      return value >= lo && value <= hi;
    }
    return parseInt(part) === value;
  });
}

/**
 * @param {string} expr
 * @param {Date} d
 * @returns {boolean}
 */
export function cronMatches(expr, d) {
  const [min, hour, dom, month, dow] = expr.trim().split(/\s+/);
  return (
    matchField(min, d.getMinutes()) &&
    matchField(hour, d.getHours()) &&
    matchField(dom, d.getDate()) &&
    matchField(month, d.getMonth() + 1) &&
    matchField(dow, d.getDay())
  );
}

/**
 * @param {Date} d
 * @returns {number}
 */
export function floorToMinute(d) {
  const t = d.getTime();
  return t - (t % 60_000);
}

/**
 * @param {Object} agent
 * @param {Object} agentState
 * @param {Date} now
 * @returns {boolean}
 */
export function shouldWake(agent, agentState, now) {
  if (agent.enabled === false) return false;
  if (agentState.status === "active") return false;
  const { schedule } = agent;
  if (!schedule) return false;
  const lastWoke = agentState.lastWokeAt
    ? new Date(agentState.lastWokeAt)
    : null;

  if (schedule.type === "cron") {
    if (lastWoke && floorToMinute(lastWoke) === floorToMinute(now))
      return false;
    return cronMatches(schedule.expression, now);
  }
  if (schedule.type === "interval") {
    const ms = (schedule.minutes || 5) * 60_000;
    return !lastWoke || now.getTime() - lastWoke.getTime() >= ms;
  }
  if (schedule.type === "once") {
    return !agentState.lastWokeAt && now >= new Date(schedule.runAt);
  }
  return false;
}

/**
 * @param {Object} agent
 * @param {Object} agentState
 * @param {Date} now
 * @returns {string|null}
 */
export function computeNextWakeAt(agent, agentState, now) {
  if (agent.enabled === false) return null;
  const { schedule } = agent;
  if (!schedule) return null;

  if (schedule.type === "interval") {
    const ms = (schedule.minutes || 5) * 60_000;
    const lastWoke = agentState.lastWokeAt
      ? new Date(agentState.lastWokeAt)
      : null;
    if (!lastWoke) return now.toISOString();
    return new Date(lastWoke.getTime() + ms).toISOString();
  }

  if (schedule.type === "cron") {
    const limit = 24 * 60;
    const start = new Date(floorToMinute(now) + 60_000);
    for (let i = 0; i < limit; i++) {
      const candidate = new Date(start.getTime() + i * 60_000);
      if (cronMatches(schedule.expression, candidate)) {
        return candidate.toISOString();
      }
    }
    return null;
  }

  if (schedule.type === "once") {
    if (agentState.lastWokeAt) return null;
    return schedule.runAt;
  }

  return null;
}

/**
 * @param {Object} agentState
 * @param {string} error
 */
export function failAgent(agentState, error) {
  Object.assign(agentState, {
    status: "failed",
    startedAt: null,
    lastWokeAt: new Date().toISOString(),
    lastError: String(error).slice(0, 500),
  });
}

// --- Scheduler class ---------------------------------------------------------

export class Scheduler {
  #loadConfig;
  #stateManager;
  #agentRunner;
  #log;

  /**
   * @param {Function} loadConfig - Returns scheduler config
   * @param {import('./state-manager.js').StateManager} stateManager
   * @param {import('./agent-runner.js').AgentRunner} agentRunner
   * @param {Function} logFn
   */
  constructor(loadConfig, stateManager, agentRunner, logFn) {
    if (!loadConfig) throw new Error("loadConfig is required");
    if (!stateManager) throw new Error("stateManager is required");
    if (!agentRunner) throw new Error("agentRunner is required");
    if (!logFn) throw new Error("logFn is required");
    this.#loadConfig = loadConfig;
    this.#stateManager = stateManager;
    this.#agentRunner = agentRunner;
    this.#log = logFn;
  }

  /**
   * Check and wake any due agents
   */
  async wakeDueAgents() {
    const config = this.#loadConfig();
    const state = this.#stateManager.load();
    const now = new Date();

    this.#stateManager.resetStaleAgents(
      state,
      { reason: "Exceeded maximum runtime", maxAge: MAX_AGENT_RUNTIME_MS },
      this.#log,
    );

    let wokeAny = false;
    for (const [name, agent] of Object.entries(config.agents)) {
      if (shouldWake(agent, state.agents[name] || {}, now)) {
        await this.#agentRunner.wake(name, agent, state);
        wokeAny = true;
      }
    }
    if (!wokeAny) this.#log("No agents due.");
  }
}
