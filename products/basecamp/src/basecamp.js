#!/usr/bin/env node

// Basecamp — CLI and scheduler for autonomous agent teams.
//
// Usage:
//   node basecamp.js                     Wake due agents once and exit
//   node basecamp.js --daemon            Run continuously (poll every 60s)
//   node basecamp.js --wake <agent>      Wake a specific agent immediately
//   node basecamp.js --init <path>       Initialize a new knowledge base
//   node basecamp.js --update [path]     Update KB with latest CLAUDE.md, agents and skills
//   node basecamp.js --stop              Gracefully stop daemon and children
//   node basecamp.js --validate          Validate agent definitions exist
//   node basecamp.js --status            Show agent status
//   node basecamp.js --help              Show this help

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  cpSync,
  copyFileSync,
  appendFileSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

import * as posixSpawn from "./posix-spawn.js";
import { StateManager } from "./state-manager.js";
import { AgentRunner } from "./agent-runner.js";
import { Scheduler, computeNextWakeAt } from "./scheduler.js";
import { KBManager } from "./kb-manager.js";
import { SocketServer, requestShutdown } from "./socket-server.js";

// --- Paths -------------------------------------------------------------------

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

// --- Logging -----------------------------------------------------------------

function createLogger(logDir, fs) {
  if (!logDir) throw new Error("logDir is required");
  if (!fs) throw new Error("fs is required");
  fs.mkdirSync(logDir, { recursive: true });
  return function log(msg) {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${msg}`;
    console.log(line);
    fs.appendFileSync(
      join(logDir, `scheduler-${ts.slice(0, 10)}.log`),
      line + "\n",
    );
  };
}

const log = createLogger(LOG_DIR, { mkdirSync, appendFileSync });

// --- Config ------------------------------------------------------------------

function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return { agents: {} };
  }
}

function expandPath(p) {
  return p.startsWith("~/") ? join(HOME, p.slice(2)) : resolve(p);
}

// --- Wire dependencies -------------------------------------------------------

const fsOps = { readFileSync, writeFileSync, mkdirSync };
const stateManager = new StateManager(STATE_PATH, fsOps);
const agentRunner = new AgentRunner(posixSpawn, stateManager, log, CACHE_DIR);
const scheduler = new Scheduler(loadConfig, stateManager, agentRunner, log);
const kbManager = new KBManager(
  {
    existsSync,
    mkdirSync,
    cpSync,
    copyFileSync,
    readFileSync,
    writeFileSync,
    readdirSync,
  },
  log,
);

// --- Template dir resolution -------------------------------------------------

/**
 * Detect if running from inside a macOS .app bundle.
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

function requireTemplateDir() {
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
  console.error("Template not found. Reinstall fit-basecamp.");
  process.exit(1);
}

// --- Daemon ------------------------------------------------------------------

function daemon() {
  const daemonStartedAt = Date.now();
  log("Scheduler daemon started. Polling every 60 seconds.");
  log(`Config: ${CONFIG_PATH}  State: ${STATE_PATH}`);

  // Reset any agents left "active" from a previous daemon session.
  const state = stateManager.load();
  stateManager.resetStaleAgents(state, { reason: "Daemon restarted" }, log);

  const socketServer = new SocketServer(
    SOCKET_PATH,
    scheduler,
    agentRunner,
    stateManager,
    loadConfig,
    log,
    CACHE_DIR,
    daemonStartedAt,
  );
  socketServer.start();

  scheduler.wakeDueAgents().catch((err) => log(`Error: ${err.message}`));
  setInterval(async () => {
    try {
      await scheduler.wakeDueAgents();
    } catch (err) {
      log(`Error: ${err.message}`);
    }
  }, 60_000);
}

// --- Update ------------------------------------------------------------------

function runUpdate(cliArgs) {
  if (cliArgs[1]) {
    kbManager.update(cliArgs[1], requireTemplateDir());
    return;
  }

  const config = loadConfig();
  const kbPaths = [
    ...new Set(
      Object.values(config.agents)
        .filter((a) => a.kb)
        .map((a) => expandPath(a.kb)),
    ),
  ];

  if (kbPaths.length === 0) {
    console.error(
      "No knowledge bases configured and no path given.\n" +
        "Usage: fit-basecamp --update [path]",
    );
    process.exit(1);
  }

  for (const kb of kbPaths) {
    console.log(`\nUpdating ${kb}...`);
    kbManager.update(kb, requireTemplateDir());
  }
}

// --- Status ------------------------------------------------------------------

function showStatus() {
  const config = loadConfig();
  const state = stateManager.load();
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

// --- Validate ----------------------------------------------------------------

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

// --- Help --------------------------------------------------------------------

function showHelp() {
  const bin = "fit-basecamp";
  console.log(`
Basecamp — Schedule autonomous agents across knowledge bases.

Usage:
  ${bin}                     Wake due agents once and exit
  ${bin} --daemon            Run continuously (poll every 60s)
  ${bin} --wake <agent>      Wake a specific agent immediately
  ${bin} --init <path>       Initialize a new knowledge base
  ${bin} --update [path]     Update KB with latest CLAUDE.md, agents and skills
  ${bin} --stop              Gracefully stop daemon and all running agents
  ${bin} --validate          Validate agent definitions exist
  ${bin} --status            Show agent status

Config:  ~/.fit/basecamp/scheduler.json
State:   ~/.fit/basecamp/state.json
Logs:    ~/.fit/basecamp/logs/
`);
}

// --- CLI entry point ---------------------------------------------------------

const args = process.argv.slice(2);
const command = args[0];
mkdirSync(BASECAMP_HOME, { recursive: true });

function requireArg(usage) {
  if (!args[1]) {
    console.error(usage);
    process.exit(1);
  }
  return args[1];
}

const commands = {
  "--help": showHelp,
  "-h": showHelp,
  "--daemon": daemon,
  "--validate": validate,
  "--stop": async () => {
    const stopped = await requestShutdown(SOCKET_PATH);
    if (!stopped) process.exit(1);
  },
  "--status": showStatus,
  "--init": () =>
    kbManager.init(
      requireArg("Usage: fit-basecamp --init <path>"),
      requireTemplateDir(),
    ),
  "--update": () => runUpdate(args),
  "--wake": async () => {
    const name = requireArg("Usage: fit-basecamp --wake <agent-name>");
    const config = loadConfig();
    const state = stateManager.load();
    const agent = config.agents[name];
    if (!agent) {
      console.error(
        `Agent "${name}" not found. Available: ${Object.keys(config.agents).join(", ") || "(none)"}`,
      );
      process.exit(1);
    }
    await agentRunner.wake(name, agent, state);
  },
};

await (commands[command] || (() => scheduler.wakeDueAgents()))();
