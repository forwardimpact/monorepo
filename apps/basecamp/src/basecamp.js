#!/usr/bin/env node

// Basecamp — CLI and scheduler for personal knowledge bases.
//
// Usage:
//   node basecamp.js                     Run due tasks once and exit
//   node basecamp.js --daemon            Run continuously (poll every 60s)
//   node basecamp.js --run <task>        Run a specific task immediately
//   node basecamp.js --init <path>       Initialize a new knowledge base
//   node basecamp.js --validate          Validate agents and skills exist
//   node basecamp.js --status            Show task status
//   node basecamp.js --help              Show this help

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  chmodSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { spawn } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

const HOME = homedir();
const BASECAMP_HOME = join(HOME, ".fit", "basecamp");
const CONFIG_PATH = join(BASECAMP_HOME, "scheduler.json");
const STATE_PATH = join(BASECAMP_HOME, "state.json");
const LOG_DIR = join(BASECAMP_HOME, "logs");
const __dirname =
  import.meta.dirname || dirname(fileURLToPath(import.meta.url));
const SHARE_DIR = "/usr/local/share/fit-basecamp";
const SOCKET_PATH = join(BASECAMP_HOME, "basecamp.sock");

// --- posix_spawn (macOS app bundle only) ------------------------------------

const USE_POSIX_SPAWN = !!process.env.BASECAMP_BUNDLE;
let posixSpawn;
if (USE_POSIX_SPAWN) {
  try {
    posixSpawn = await import("./posix-spawn.js");
  } catch (err) {
    console.error(
      "Failed to load posix-spawn, falling back to child_process:",
      err.message,
    );
  }
}

let daemonStartedAt = null;

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
  return readJSON(CONFIG_PATH, { tasks: {} });
}
function loadState() {
  const raw = readJSON(STATE_PATH, null);
  if (!raw || typeof raw !== "object" || !raw.tasks) {
    const state = { tasks: {} };
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

function shouldRun(task, taskState, now) {
  if (task.enabled === false) return false;
  if (taskState.status === "running") return false;
  const { schedule } = task;
  if (!schedule) return false;
  const lastRun = taskState.lastRunAt ? new Date(taskState.lastRunAt) : null;

  if (schedule.type === "cron") {
    if (lastRun && floorToMinute(lastRun) === floorToMinute(now)) return false;
    return cronMatches(schedule.expression, now);
  }
  if (schedule.type === "interval") {
    const ms = (schedule.minutes || 5) * 60_000;
    return !lastRun || now.getTime() - lastRun.getTime() >= ms;
  }
  if (schedule.type === "once") {
    return !taskState.lastRunAt && now >= new Date(schedule.runAt);
  }
  return false;
}

// --- Task execution ---------------------------------------------------------

async function runTask(taskName, task, _config, state) {
  if (!task.kb) {
    log(`Task ${taskName}: no "kb" specified, skipping.`);
    return;
  }
  const kbPath = expandPath(task.kb);
  if (!existsSync(kbPath)) {
    log(`Task ${taskName}: path "${kbPath}" does not exist, skipping.`);
    return;
  }

  const claude = findClaude();
  const prompt = task.skill
    ? `Use the skill "${task.skill}" — ${task.prompt || `Run the ${taskName} task.`}`
    : task.prompt || `Run the ${taskName} task.`;

  log(
    `Running task: ${taskName} (kb: ${task.kb}${task.agent ? `, agent: ${task.agent}` : ""}${task.skill ? `, skill: ${task.skill}` : ""})`,
  );

  const ts = (state.tasks[taskName] ||= {});
  ts.status = "running";
  ts.startedAt = new Date().toISOString();
  saveState(state);

  const spawnArgs = ["--print"];
  if (task.agent) spawnArgs.push("--agent", task.agent);
  spawnArgs.push("-p", prompt);

  // Use posix_spawn when running inside the app bundle for TCC inheritance.
  // Fall back to child_process.spawn for dev mode and other platforms.
  if (posixSpawn) {
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
        log(`Task ${taskName} completed. Output: ${stdout.slice(0, 200)}...`);
        Object.assign(ts, {
          status: "finished",
          startedAt: null,
          lastRunAt: new Date().toISOString(),
          lastError: null,
          runCount: (ts.runCount || 0) + 1,
        });
      } else {
        const errMsg = stderr || stdout || `Exit code ${exitCode}`;
        log(`Task ${taskName} failed: ${errMsg.slice(0, 300)}`);
        Object.assign(ts, {
          status: "failed",
          startedAt: null,
          lastRunAt: new Date().toISOString(),
          lastError: errMsg.slice(0, 500),
        });
      }
      saveState(state);
    } catch (err) {
      log(`Task ${taskName} failed: ${err.message}`);
      Object.assign(ts, {
        status: "failed",
        startedAt: null,
        lastRunAt: new Date().toISOString(),
        lastError: err.message.slice(0, 500),
      });
      saveState(state);
    }
    return;
  }

  return new Promise((resolve) => {
    const child = spawn(claude, spawnArgs, {
      cwd: kbPath,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30 * 60_000,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));

    child.on("close", (code) => {
      if (code === 0) {
        log(`Task ${taskName} completed. Output: ${stdout.slice(0, 200)}...`);
        Object.assign(ts, {
          status: "finished",
          startedAt: null,
          lastRunAt: new Date().toISOString(),
          lastError: null,
          runCount: (ts.runCount || 0) + 1,
        });
      } else {
        const errMsg = stderr || stdout || `Exit code ${code}`;
        log(`Task ${taskName} failed: ${errMsg.slice(0, 300)}`);
        Object.assign(ts, {
          status: "failed",
          startedAt: null,
          lastRunAt: new Date().toISOString(),
          lastError: errMsg.slice(0, 500),
        });
      }
      saveState(state);
      resolve();
    });

    child.on("error", (err) => {
      log(`Task ${taskName} failed: ${err.message}`);
      Object.assign(ts, {
        status: "failed",
        startedAt: null,
        lastRunAt: new Date().toISOString(),
        lastError: err.message.slice(0, 500),
      });
      saveState(state);
      resolve();
    });
  });
}

async function runDueTasks() {
  const config = loadConfig(),
    state = loadState(),
    now = new Date();
  let ranAny = false;
  for (const [name, task] of Object.entries(config.tasks)) {
    if (shouldRun(task, state.tasks[name] || {}, now)) {
      await runTask(name, task, config, state);
      ranAny = true;
    }
  }
  if (!ranAny) log("No tasks due.");
}

// --- Next-run computation ---------------------------------------------------

/** @param {object} task @param {object} taskState @param {Date} now */
function computeNextRunAt(task, taskState, now) {
  if (task.enabled === false) return null;
  const { schedule } = task;
  if (!schedule) return null;

  if (schedule.type === "interval") {
    const ms = (schedule.minutes || 5) * 60_000;
    const lastRun = taskState.lastRunAt ? new Date(taskState.lastRunAt) : null;
    if (!lastRun) return now.toISOString();
    return new Date(lastRun.getTime() + ms).toISOString();
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
    if (taskState.lastRunAt) return null;
    return schedule.runAt;
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
  const tasks = {};

  for (const [name, task] of Object.entries(config.tasks)) {
    const ts = state.tasks[name] || {};
    tasks[name] = {
      enabled: task.enabled !== false,
      status: ts.status || "never-run",
      lastRunAt: ts.lastRunAt || null,
      nextRunAt: computeNextRunAt(task, ts, now),
      runCount: ts.runCount || 0,
      lastError: ts.lastError || null,
    };
    if (ts.startedAt) tasks[name].startedAt = ts.startedAt;
  }

  send(socket, {
    type: "status",
    uptime: daemonStartedAt
      ? Math.floor((Date.now() - daemonStartedAt) / 1000)
      : 0,
    tasks,
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

  if (request.type === "run") {
    if (!request.task) {
      send(socket, { type: "error", message: "Missing task name" });
      return;
    }
    const config = loadConfig();
    const task = config.tasks[request.task];
    if (!task) {
      send(socket, {
        type: "error",
        message: `Task not found: ${request.task}`,
      });
      return;
    }
    send(socket, { type: "ack", command: "run", task: request.task });
    const state = loadState();
    runTask(request.task, task, config, state).catch(() => {});
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
  startSocketServer();
  runDueTasks().catch((err) => log(`Error: ${err.message}`));
  setInterval(async () => {
    try {
      await runDueTasks();
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

  const tasks = Object.entries(config.tasks || {});
  if (tasks.length === 0) {
    console.log(`No tasks configured.\n\nEdit ${CONFIG_PATH} to add tasks.`);
    return;
  }

  console.log("Tasks:");
  for (const [name, task] of tasks) {
    const s = state.tasks[name] || {};
    const kbStatus =
      task.kb && !existsSync(expandPath(task.kb)) ? " (not found)" : "";
    console.log(
      `  ${task.enabled !== false ? "+" : "-"} ${name}\n` +
        `    KB: ${task.kb || "(none)"}${kbStatus}  Schedule: ${JSON.stringify(task.schedule)}\n` +
        `    Status: ${s.status || "never-run"}  Last: ${s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : "never"}  Runs: ${s.runCount || 0}` +
        (task.agent ? `\n    Agent: ${task.agent}` : "") +
        (task.skill ? `\n    Skill: ${task.skill}` : "") +
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
  const tasks = Object.entries(config.tasks || {});
  if (tasks.length === 0) {
    console.log("No tasks configured. Nothing to validate.");
    return;
  }

  console.log("\nValidating tasks...\n");
  let errors = 0;

  for (const [name, task] of tasks) {
    if (!task.kb) {
      console.log(`  [FAIL] ${name}: no "kb" path specified`);
      errors++;
      continue;
    }
    const kbPath = expandPath(task.kb);
    if (!existsSync(kbPath)) {
      console.log(`  [FAIL] ${name}: path not found: ${kbPath}`);
      errors++;
      continue;
    }

    for (const [kind, sub] of [
      ["agent", task.agent],
      ["skill", task.skill],
    ]) {
      if (!sub) continue;
      const relPath =
        kind === "agent"
          ? join("agents", sub.endsWith(".md") ? sub : sub + ".md")
          : join("skills", sub, "SKILL.md");
      const found = findInLocalOrGlobal(kbPath, relPath);
      console.log(
        `  [${found ? "OK" : "FAIL"}]  ${name}: ${kind} "${sub}"${found ? "" : " not found"}`,
      );
      if (!found) errors++;
    }

    if (!task.agent && !task.skill)
      console.log(`  [OK]   ${name}: no agent or skill to validate`);
  }

  console.log(errors > 0 ? `\n${errors} error(s).` : "\nAll OK.");
  if (errors > 0) process.exit(1);
}

// --- Help -------------------------------------------------------------------

function showHelp() {
  const bin = "fit-basecamp";
  console.log(`
Basecamp — Run scheduled Claude tasks across knowledge bases.

Usage:
  ${bin}                     Run due tasks once and exit
  ${bin} --daemon            Run continuously (poll every 60s)
  ${bin} --run <task>        Run a specific task immediately
  ${bin} --init <path>       Initialize a new knowledge base
  ${bin} --validate          Validate agents and skills exist
  ${bin} --status            Show task status

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
  "--run": async () => {
    if (!args[1]) {
      console.error("Usage: node basecamp.js --run <task-name>");
      process.exit(1);
    }
    const config = loadConfig(),
      state = loadState(),
      task = config.tasks[args[1]];
    if (!task) {
      console.error(
        `Task "${args[1]}" not found. Available: ${Object.keys(config.tasks).join(", ") || "(none)"}`,
      );
      process.exit(1);
    }
    await runTask(args[1], task, config, state);
  },
};

await (commands[command] || runDueTasks)();
