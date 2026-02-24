#!/usr/bin/env node

// Basecamp — CLI and scheduler for autonomous agent teams.
//
// Usage:
//   node basecamp.js                     Wake due agents once and exit
//   node basecamp.js --daemon            Run continuously (poll every 60s)
//   node basecamp.js --wake <agent>      Wake a specific agent immediately
//   node basecamp.js --init <path>       Initialize a new knowledge base
//   node basecamp.js --validate          Validate agent definitions exist
//   node basecamp.js --status            Show agent status
//   node basecamp.js --help              Show this help

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  chmodSync,
  readdirSync,
  statSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

const HOME = homedir();
const BASECAMP_HOME = join(HOME, ".fit", "basecamp");
const CONFIG_PATH = join(BASECAMP_HOME, "scheduler.json");
const STATE_PATH = join(BASECAMP_HOME, "state.json");
const LOG_DIR = join(BASECAMP_HOME, "logs");
const CACHE_DIR = join(HOME, ".cache", "fit", "basecamp");
const __dirname =
  import.meta.dirname || dirname(fileURLToPath(import.meta.url));
const SHARE_DIR = "/usr/local/share/fit-basecamp";
const SOCKET_PATH = join(BASECAMP_HOME, "basecamp.sock");

// --- posix_spawn (TCC-compliant process spawning) ---------------------------

import * as posixSpawn from "./posix-spawn.js";

let daemonStartedAt = null;

// Maximum time an agent can be "active" before being considered stale (35 min).
// Matches the 30-minute child_process timeout plus a buffer.
const MAX_AGENT_RUNTIME_MS = 35 * 60_000;

// --- Helpers ----------------------------------------------------------------

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readJSON(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJSON(path, data) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function expandPath(p) {
  return p.startsWith("~/") ? join(HOME, p.slice(2)) : resolve(p);
}

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    ensureDir(LOG_DIR);
    writeFileSync(
      join(LOG_DIR, `scheduler-${ts.slice(0, 10)}.log`),
      line + "\n",
      { flag: "a" },
    );
  } catch {
    /* best effort */
  }
}

function findClaude() {
  const paths = [
    "/usr/local/bin/claude",
    join(HOME, ".claude", "bin", "claude"),
    join(HOME, ".local", "bin", "claude"),
    "/opt/homebrew/bin/claude",
  ];
  for (const p of paths) if (existsSync(p)) return p;
  return "claude";
}

/**
 * Detect if running from inside a macOS .app bundle.
 * The binary is at Basecamp.app/Contents/MacOS/fit-basecamp.
 * @returns {{ bundle: string, resources: string } | null}
 */
function getBundlePath() {
  try {
    const exe = process.execPath || "";
    const macosDir = dirname(exe);
    const contentsDir = dirname(macosDir);
    const resourcesDir = join(contentsDir, "Resources");
    if (existsSync(join(resourcesDir, "config"))) {
      return { bundle: dirname(contentsDir), resources: resourcesDir };
    }
  } catch {
    /* not in bundle */
  }
  return null;
}

function loadConfig() {
  return readJSON(CONFIG_PATH, { agents: {} });
}
function loadState() {
  const raw = readJSON(STATE_PATH, null);
  if (!raw || typeof raw !== "object" || !raw.agents) {
    const state = { agents: {} };
    saveState(state);
    return state;
  }
  return raw;
}
function saveState(state) {
  writeJSON(STATE_PATH, state);
}

// --- Cron matching ----------------------------------------------------------

function matchField(field, value) {
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

function cronMatches(expr, d) {
  const [min, hour, dom, month, dow] = expr.trim().split(/\s+/);
  return (
    matchField(min, d.getMinutes()) &&
    matchField(hour, d.getHours()) &&
    matchField(dom, d.getDate()) &&
    matchField(month, d.getMonth() + 1) &&
    matchField(dow, d.getDay())
  );
}

// --- Scheduling logic -------------------------------------------------------

function floorToMinute(d) {
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
  ).getTime();
}

function shouldWake(agent, agentState, now) {
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

// --- Agent execution --------------------------------------------------------

async function wakeAgent(agentName, agent, _config, state) {
  if (!agent.kb) {
    log(`Agent ${agentName}: no "kb" specified, skipping.`);
    return;
  }
  const kbPath = expandPath(agent.kb);
  if (!existsSync(kbPath)) {
    log(`Agent ${agentName}: path "${kbPath}" does not exist, skipping.`);
    return;
  }

  const claude = findClaude();

  log(`Waking agent: ${agentName} (kb: ${agent.kb})`);

  const as = (state.agents[agentName] ||= {});
  as.status = "active";
  as.startedAt = new Date().toISOString();
  saveState(state);

  const spawnArgs = ["--agent", agentName, "--print", "-p", "Observe and act."];

  try {
    const { pid, stdoutFd, stderrFd } = posixSpawn.spawn(
      claude,
      spawnArgs,
      undefined,
      kbPath,
    );

    // Read stdout and stderr concurrently to avoid pipe deadlocks,
    // then wait for the child to exit.
    const [stdout, stderr] = await Promise.all([
      posixSpawn.readAll(stdoutFd),
      posixSpawn.readAll(stderrFd),
    ]);
    const exitCode = await posixSpawn.waitForExit(pid);

    if (exitCode === 0) {
      log(`Agent ${agentName} completed. Output: ${stdout.slice(0, 200)}...`);
      updateAgentState(as, stdout, agentName);
    } else {
      const errMsg = stderr || stdout || `Exit code ${exitCode}`;
      log(`Agent ${agentName} failed: ${errMsg.slice(0, 300)}`);
      Object.assign(as, {
        status: "failed",
        startedAt: null,
        lastWokeAt: new Date().toISOString(),
        lastError: errMsg.slice(0, 500),
      });
    }
    saveState(state);
  } catch (err) {
    log(`Agent ${agentName} failed: ${err.message}`);
    Object.assign(as, {
      status: "failed",
      startedAt: null,
      lastWokeAt: new Date().toISOString(),
      lastError: err.message.slice(0, 500),
    });
    saveState(state);
  }
}

/**
 * Parse Decision:/Action: lines from agent output and update state.
 * Also saves stdout to the state directory as a briefing fallback.
 * @param {object} agentState
 * @param {string} stdout
 * @param {string} agentName
 */
function updateAgentState(agentState, stdout, agentName) {
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

  // Save output as briefing fallback so View Briefing always has content
  const stateDir = join(CACHE_DIR, "state");
  ensureDir(stateDir);
  const prefix = agentName.replace(/-/g, "_");
  writeFileSync(join(stateDir, `${prefix}_last_output.md`), stdout);
}

/**
 * Reset agents stuck in "active" state. This happens when the daemon
 * restarts while agents were running, or when a child process exits
 * without triggering cleanup (e.g. pipe error, signal).
 *
 * @param {object} state
 * @param {{ reason: string, maxAge?: number }} opts
 *   reason  — logged and stored in lastError
 *   maxAge  — if set, only reset agents active longer than this (ms)
 */
function resetStaleAgents(state, { reason, maxAge }) {
  let resetCount = 0;
  for (const [name, as] of Object.entries(state.agents)) {
    if (as.status !== "active") continue;
    if (maxAge && as.startedAt) {
      const elapsed = Date.now() - new Date(as.startedAt).getTime();
      if (elapsed < maxAge) continue;
    }
    log(`Resetting stale agent: ${name} (${reason})`);
    Object.assign(as, {
      status: "interrupted",
      startedAt: null,
      lastError: reason,
    });
    resetCount++;
  }
  if (resetCount > 0) saveState(state);
  return resetCount;
}

async function wakeDueAgents() {
  const config = loadConfig(),
    state = loadState(),
    now = new Date();

  // Reset agents that have been active longer than the maximum runtime.
  resetStaleAgents(state, {
    reason: "Exceeded maximum runtime",
    maxAge: MAX_AGENT_RUNTIME_MS,
  });

  let wokeAny = false;
  for (const [name, agent] of Object.entries(config.agents)) {
    if (shouldWake(agent, state.agents[name] || {}, now)) {
      await wakeAgent(name, agent, config, state);
      wokeAny = true;
    }
  }
  if (!wokeAny) log("No agents due.");
}

// --- Next-wake computation --------------------------------------------------

/** @param {object} agent @param {object} agentState @param {Date} now */
function computeNextWakeAt(agent, agentState, now) {
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

// --- Briefing file resolution -----------------------------------------------

/**
 * Resolve the briefing file for an agent by convention:
 * 1. Scan ~/.cache/fit/basecamp/state/ for files matching {agent_name}_*.md
 * 2. Fall back to the KB's knowledge/Briefings/ directory (latest .md file)
 *
 * @param {string} agentName
 * @param {object} agentConfig
 * @returns {string|null}
 */
function resolveBriefingFile(agentName, agentConfig) {
  // 1. Scan state directory for agent-specific files
  const stateDir = join(CACHE_DIR, "state");
  if (existsSync(stateDir)) {
    const prefix = agentName.replace(/-/g, "_") + "_";
    const matches = readdirSync(stateDir).filter(
      (f) => f.startsWith(prefix) && f.endsWith(".md"),
    );
    if (matches.length === 1) return join(stateDir, matches[0]);
    if (matches.length > 1) {
      return matches
        .map((f) => join(stateDir, f))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
    }
  }

  // 2. Fall back to KB briefings directory
  if (agentConfig.kb) {
    const kbPath = expandPath(agentConfig.kb);
    const dir = join(kbPath, "knowledge", "Briefings");
    if (existsSync(dir)) {
      const files = readdirSync(dir)
        .filter((f) => f.endsWith(".md"))
        .sort()
        .reverse();
      if (files.length > 0) return join(dir, files[0]);
    }
  }

  return null;
}

// --- Socket server ----------------------------------------------------------

/** @param {import('node:net').Socket} socket @param {object} data */
function send(socket, data) {
  try {
    socket.write(JSON.stringify(data) + "\n");
  } catch {}
}

function handleStatusRequest(socket) {
  const config = loadConfig();
  const state = loadState();
  const now = new Date();
  const agents = {};

  for (const [name, agent] of Object.entries(config.agents)) {
    const as = state.agents[name] || {};
    agents[name] = {
      enabled: agent.enabled !== false,
      status: as.status || "never-woken",
      lastWokeAt: as.lastWokeAt || null,
      nextWakeAt: computeNextWakeAt(agent, as, now),
      lastAction: as.lastAction || null,
      lastDecision: as.lastDecision || null,
      wakeCount: as.wakeCount || 0,
      lastError: as.lastError || null,
      kbPath: agent.kb ? expandPath(agent.kb) : null,
      briefingFile: resolveBriefingFile(name, agent),
    };
    if (as.startedAt) agents[name].startedAt = as.startedAt;
  }

  send(socket, {
    type: "status",
    uptime: daemonStartedAt
      ? Math.floor((Date.now() - daemonStartedAt) / 1000)
      : 0,
    agents,
  });
}

function handleMessage(socket, line) {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    send(socket, { type: "error", message: "Invalid JSON" });
    return;
  }

  if (request.type === "status") return handleStatusRequest(socket);

  if (request.type === "wake") {
    if (!request.agent) {
      send(socket, { type: "error", message: "Missing agent name" });
      return;
    }
    const config = loadConfig();
    const agent = config.agents[request.agent];
    if (!agent) {
      send(socket, {
        type: "error",
        message: `Agent not found: ${request.agent}`,
      });
      return;
    }
    send(socket, { type: "ack", command: "wake", agent: request.agent });
    const state = loadState();
    wakeAgent(request.agent, agent, config, state).catch(() => {});
    return;
  }

  send(socket, {
    type: "error",
    message: `Unknown request type: ${request.type}`,
  });
}

function startSocketServer() {
  try {
    unlinkSync(SOCKET_PATH);
  } catch {}

  const server = createServer((socket) => {
    let buffer = "";
    socket.on("data", (data) => {
      buffer += data.toString();
      let idx;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line) handleMessage(socket, line);
      }
    });
    socket.on("error", () => {});
  });

  server.listen(SOCKET_PATH, () => {
    chmodSync(SOCKET_PATH, 0o600);
    log(`Socket server listening on ${SOCKET_PATH}`);
  });

  server.on("error", (err) => {
    log(`Socket server error: ${err.message}`);
  });

  const cleanup = () => {
    server.close();
    process.exit(0);
  };
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

  return server;
}

// --- Daemon -----------------------------------------------------------------

function daemon() {
  daemonStartedAt = Date.now();
  log("Scheduler daemon started. Polling every 60 seconds.");
  log(`Config: ${CONFIG_PATH}  State: ${STATE_PATH}`);

  // Reset any agents left "active" from a previous daemon session.
  const state = loadState();
  resetStaleAgents(state, { reason: "Daemon restarted" });

  startSocketServer();
  wakeDueAgents().catch((err) => log(`Error: ${err.message}`));
  setInterval(async () => {
    try {
      await wakeDueAgents();
    } catch (err) {
      log(`Error: ${err.message}`);
    }
  }, 60_000);
}

// --- Init knowledge base ----------------------------------------------------

function findTemplateDir() {
  const bundle = getBundlePath();
  if (bundle) {
    const tpl = join(bundle.resources, "template");
    if (existsSync(tpl)) return tpl;
  }
  for (const d of [
    join(SHARE_DIR, "template"),
    join(__dirname, "..", "template"),
  ])
    if (existsSync(d)) return d;
  return null;
}

function initKB(targetPath) {
  const dest = expandPath(targetPath);
  if (existsSync(join(dest, "CLAUDE.md"))) {
    console.error(`Knowledge base already exists at ${dest}`);
    process.exit(1);
  }
  const tpl = findTemplateDir();
  if (!tpl) {
    console.error("Template not found. Reinstall fit-basecamp.");
    process.exit(1);
  }

  ensureDir(dest);
  for (const d of [
    "knowledge/People",
    "knowledge/Organizations",
    "knowledge/Projects",
    "knowledge/Topics",
    "knowledge/Briefings",
  ])
    ensureDir(join(dest, d));

  execSync(`cp -R "${tpl}/." "${dest}/"`);

  console.log(
    `Knowledge base initialized at ${dest}\n\nNext steps:\n  1. Edit ${dest}/USER.md with your name, email, and domain\n  2. cd ${dest} && claude`,
  );
}

// --- Status -----------------------------------------------------------------

function showStatus() {
  const config = loadConfig(),
    state = loadState();
  console.log("\nBasecamp Scheduler\n==================\n");

  const agents = Object.entries(config.agents || {});
  if (agents.length === 0) {
    console.log(`No agents configured.\n\nEdit ${CONFIG_PATH} to add agents.`);
    return;
  }

  console.log("Agents:");
  for (const [name, agent] of agents) {
    const s = state.agents[name] || {};
    const kbStatus =
      agent.kb && !existsSync(expandPath(agent.kb)) ? " (not found)" : "";
    console.log(
      `  ${agent.enabled !== false ? "+" : "-"} ${name}\n` +
        `    KB: ${agent.kb || "(none)"}${kbStatus}  Schedule: ${JSON.stringify(agent.schedule)}\n` +
        `    Status: ${s.status || "never-woken"}  Last wake: ${s.lastWokeAt ? new Date(s.lastWokeAt).toLocaleString() : "never"}  Wakes: ${s.wakeCount || 0}` +
        (s.lastAction ? `\n    Last action: ${s.lastAction}` : "") +
        (s.lastDecision ? `\n    Last decision: ${s.lastDecision}` : "") +
        (s.lastError ? `\n    Error: ${s.lastError.slice(0, 80)}` : ""),
    );
  }
}

// --- Validate ---------------------------------------------------------------

function findInLocalOrGlobal(kbPath, subPath) {
  const local = join(kbPath, ".claude", subPath);
  const global = join(HOME, ".claude", subPath);
  if (existsSync(local)) return local;
  if (existsSync(global)) return global;
  return null;
}

function validate() {
  const config = loadConfig();
  const agents = Object.entries(config.agents || {});
  if (agents.length === 0) {
    console.log("No agents configured. Nothing to validate.");
    return;
  }

  console.log("\nValidating agents...\n");
  let errors = 0;

  for (const [name, agent] of agents) {
    if (!agent.kb) {
      console.log(`  [FAIL] ${name}: no "kb" path specified`);
      errors++;
      continue;
    }
    const kbPath = expandPath(agent.kb);
    if (!existsSync(kbPath)) {
      console.log(`  [FAIL] ${name}: path not found: ${kbPath}`);
      errors++;
      continue;
    }

    const agentFile = join("agents", name + ".md");
    const found = findInLocalOrGlobal(kbPath, agentFile);
    console.log(
      `  [${found ? "OK" : "FAIL"}]  ${name}: agent definition${found ? "" : " not found"}`,
    );
    if (!found) errors++;
  }

  console.log(errors > 0 ? `\n${errors} error(s).` : "\nAll OK.");
  if (errors > 0) process.exit(1);
}

// --- Help -------------------------------------------------------------------

function showHelp() {
  const bin = "fit-basecamp";
  console.log(`
Basecamp — Schedule autonomous agents across knowledge bases.

Usage:
  ${bin}                     Wake due agents once and exit
  ${bin} --daemon            Run continuously (poll every 60s)
  ${bin} --wake <agent>      Wake a specific agent immediately
  ${bin} --init <path>       Initialize a new knowledge base
  ${bin} --validate          Validate agent definitions exist
  ${bin} --status            Show agent status

Config:  ~/.fit/basecamp/scheduler.json
State:   ~/.fit/basecamp/state.json
Logs:    ~/.fit/basecamp/logs/
`);
}

// --- CLI entry point --------------------------------------------------------

const args = process.argv.slice(2);
const command = args[0];
ensureDir(BASECAMP_HOME);

const commands = {
  "--help": showHelp,
  "-h": showHelp,
  "--daemon": daemon,
  "--validate": validate,
  "--status": showStatus,
  "--init": () => {
    if (!args[1]) {
      console.error("Usage: node basecamp.js --init <path>");
      process.exit(1);
    }
    initKB(args[1]);
  },
  "--wake": async () => {
    if (!args[1]) {
      console.error("Usage: node basecamp.js --wake <agent-name>");
      process.exit(1);
    }
    const config = loadConfig(),
      state = loadState(),
      agent = config.agents[args[1]];
    if (!agent) {
      console.error(
        `Agent "${args[1]}" not found. Available: ${Object.keys(config.agents).join(", ") || "(none)"}`,
      );
      process.exit(1);
    }
    await wakeAgent(args[1], agent, config, state);
  },
};

await (commands[command] || wakeDueAgents)();
