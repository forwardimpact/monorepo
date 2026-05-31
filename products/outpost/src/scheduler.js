/**
 * Scheduler — cron matching, shouldWake logic, wake orchestration.
 *
 * The genuine wall-clock read ("what time is it now?") routes through the
 * injected `runtime.clock` (see `Scheduler#wakeDueAgents` and `failAgent`).
 * The pure cron helpers below receive that `now` as an explicit `Date` and
 * construct further `Date` objects only for deterministic date *arithmetic*
 * over caller-supplied or parsed-from-state inputs (never an ambient no-arg
 * `new Date()`); the AST checker cannot distinguish the two, so this file is
 * allow-listed in check-ambient-deps.allow.yml with that reason.
 */

import { isoTimestamp } from "@forwardimpact/libutil";

/** Maximum time an agent can be "active" before being considered stale (35 min). */
const MAX_AGENT_RUNTIME_MS = 35 * 60_000;

/**
 * Build a `Date` for "now" from the injected clock's milliseconds. The cron
 * helpers operate on `Date` objects; this is the single seam that turns the
 * wall-clock read (`runtime.clock.now()`) into one, so callers in other
 * modules never construct an ambient `new Date()` themselves.
 * @param {{now: () => number}} clock
 * @returns {Date}
 */
export function nowFromClock(clock) {
  return new Date(clock.now());
}

/**
 * Format a stored ISO timestamp as a human-readable local time string. Parses
 * an explicit value (never the wall clock); lives here so the only `new Date`
 * construction sites stay in this allow-listed module.
 * @param {string} iso
 * @returns {string}
 */
export function formatLocalTime(iso) {
  return new Date(Date.parse(iso)).toLocaleString();
}

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
 * @param {Object} schedule
 * @param {Object} agentState
 * @param {Date} now
 * @returns {string|null}
 */
function nextWakeInterval(schedule, agentState, now) {
  const ms = (schedule.minutes || 5) * 60_000;
  const lastWoke = agentState.lastWokeAt
    ? new Date(agentState.lastWokeAt)
    : null;
  if (!lastWoke) return now.toISOString();
  return new Date(lastWoke.getTime() + ms).toISOString();
}

/**
 * @param {Object} schedule
 * @param {Date} now
 * @returns {string|null}
 */
function nextWakeCron(schedule, now) {
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

  if (schedule.type === "interval")
    return nextWakeInterval(schedule, agentState, now);
  if (schedule.type === "cron") return nextWakeCron(schedule, now);
  if (schedule.type === "once")
    return agentState.lastWokeAt ? null : schedule.runAt;
  return null;
}

/**
 * @param {Object} agentState
 * @param {string} error
 * @param {number} nowMs - Wall-clock milliseconds (from `runtime.clock.now()`)
 */
export function failAgent(agentState, error, nowMs) {
  Object.assign(agentState, {
    status: "failed",
    startedAt: null,
    lastWokeAt: isoTimestamp(nowMs),
    lastError: String(error).slice(0, 500),
  });
}

// --- Scheduler class ---------------------------------------------------------

/** Orchestrate periodic agent wakes by evaluating schedules and delegating to AgentRunner. */
export class Scheduler {
  #loadConfig;
  #stateManager;
  #agentRunner;
  #log;
  #clock;

  /**
   * @param {() => Promise<Object>} loadConfig - Returns scheduler config
   * @param {import('./state-manager.js').StateManager} stateManager
   * @param {import('./agent-runner.js').AgentRunner} agentRunner
   * @param {Function} logFn
   * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
   *   Injected runtime bag (uses `clock` for the wall-clock read).
   */
  constructor(loadConfig, stateManager, agentRunner, logFn, runtime) {
    if (!loadConfig) throw new Error("loadConfig is required");
    if (!stateManager) throw new Error("stateManager is required");
    if (!agentRunner) throw new Error("agentRunner is required");
    if (!logFn) throw new Error("logFn is required");
    if (!runtime?.clock) throw new Error("runtime.clock is required");
    this.#loadConfig = loadConfig;
    this.#stateManager = stateManager;
    this.#agentRunner = agentRunner;
    this.#log = logFn;
    this.#clock = runtime.clock;
  }

  /**
   * Reset any agents exceeding max runtime, reload config, then wake each agent whose schedule is due.
   */
  async wakeDueAgents() {
    const config = await this.#loadConfig();
    const state = await this.#stateManager.load();
    const now = nowFromClock(this.#clock);

    await this.#stateManager.resetStaleAgents(
      state,
      { reason: "Exceeded maximum runtime", maxAge: MAX_AGENT_RUNTIME_MS },
      this.#log,
    );

    let wokeAny = false;
    for (const [name, agent] of Object.entries(config.agents)) {
      if (shouldWake(agent, state.agents[name] || {}, now)) {
        await this.#agentRunner.wake(name, agent, state, config.env);
        wokeAny = true;
      }
    }
    if (!wokeAny) this.#log("No agents due.");
  }
}
