/**
 * WorkdirManager — per-task lifecycle: create the agent CWD, seed it from the
 * task's workdir + specs + staged .claude/, allocate a free TCP port, run
 * the pre-flight smoke probe, and tear down the process group at end of run.
 *
 * The Workdir handle threads `cwd`, `port`, `pgid`, and trace paths through
 * runAgent → score → judge → teardown.
 */

import { spawn } from "node:child_process";
import { cp, mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { connect } from "node:net";
import { join, sep } from "node:path";

const PREFLIGHT_REL = join("workdir", "scripts");
const DEFAULT_TERM_GRACE_MS = 5_000;

/**
 * @typedef {object} Workdir
 * @property {string} cwd - Agent CWD (per-task copy).
 * @property {string} runDir - Parent of `cwd`; holds trace/log siblings.
 * @property {number} port - Allocated TCP port for the agent.
 * @property {number} pgid - Process-group id captured from the preflight child.
 * @property {*} scaffold - Reserved per design § Components; v1 sets null.
 * @property {string} agentTracePath
 * @property {string} judgeTracePath
 * @property {{phase: string, message: string, exitCode: number}} [preflightError]
 */

/** Per-task workdir lifecycle: seed → preflight → teardown. */
export class WorkdirManager {
  /**
   * @param {object} deps
   * @param {string} deps.stagingDir - Output of `installApm(...)`.
   * @param {string} deps.runOutputDir - Root run-output directory (parent of `runs/`).
   */
  constructor({ stagingDir, runOutputDir, termGraceMs }) {
    if (!stagingDir) throw new Error("stagingDir is required");
    if (!runOutputDir) throw new Error("runOutputDir is required");
    this.stagingDir = stagingDir;
    this.runOutputDir = runOutputDir;
    this.termGraceMs = termGraceMs ?? DEFAULT_TERM_GRACE_MS;
  }

  /**
   * Create the per-task working directory and run the pre-flight probe.
   * @param {import("./task-family.js").Task} task
   * @param {number} runIndex
   * @returns {Promise<Workdir>}
   */
  async start(task, runIndex) {
    const slug = task.id.replace("/", "__");
    const runDir = join(this.runOutputDir, "runs", slug, String(runIndex));
    const cwd = join(runDir, "cwd");
    await mkdir(cwd, { recursive: true });

    await cp(task.paths.workdir, cwd, {
      recursive: true,
      filter: (src) => !src.endsWith(sep + PREFLIGHT_REL),
    });
    await cp(task.paths.specs, join(cwd, "specs"), {
      recursive: true,
    }).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
    await cp(join(this.stagingDir, ".claude"), join(cwd, ".claude"), {
      recursive: true,
    });

    const port = await allocatePort();
    const agentTracePath = join(runDir, "agent.ndjson");
    const judgeTracePath = join(runDir, "judge.ndjson");

    const preflightScript = join(task.paths.workdir, "scripts", "preflight.sh");
    const preflight = await runPreflight(preflightScript, cwd, port);

    return {
      cwd,
      runDir,
      port,
      pgid: preflight.pgid,
      scaffold: null,
      agentTracePath,
      judgeTracePath,
      ...(preflight.error && { preflightError: preflight.error }),
    };
  }

  /**
   * Tear down the per-task process group: SIGTERM, wait, SIGKILL, then probe.
   * @param {Workdir} workdir
   * @returns {Promise<{portFree: boolean, descendants: number}>}
   */
  async teardown(workdir) {
    if (workdir.pgid && workdir.pgid > 0) {
      try {
        process.kill(-workdir.pgid, "SIGTERM");
      } catch {
        // Process group already gone — fine.
      }
      await sleep(this.termGraceMs);
      try {
        process.kill(-workdir.pgid, "SIGKILL");
      } catch {
        // Already exited.
      }
      // Poll briefly until the process group is empty — SIGKILL returns
      // before the kernel finishes reaping descendants.
      await waitFor(
        async () => (await countDescendants(workdir.pgid)) === 0,
        2_000,
      );
    }
    const portFree = await isPortFree(workdir.port);
    const descendants = await countDescendants(workdir.pgid);
    return { portFree, descendants };
  }
}

/**
 * Spawn preflight. Stays detached so we can SIGTERM the whole process group.
 * @param {string} script
 * @param {string} cwd - Agent CWD passed via $WORKDIR.
 * @param {number} port - Free TCP port passed via $PORT.
 * @returns {Promise<{pgid: number, error?: {phase: string, message: string, exitCode: number}}>}
 */
function runPreflight(script, cwd, port) {
  return new Promise((res, rej) => {
    let stderr = "";
    const child = spawn(script, [], {
      cwd,
      env: { ...process.env, WORKDIR: cwd, PORT: String(port) },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (child.pid === undefined) {
      rej(new Error(`failed to spawn preflight: ${script}`));
      return;
    }
    const pgid = child.pid;
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (e) => {
      res({
        pgid,
        error: {
          phase: "preflight",
          message: `preflight failed to spawn: ${e.message}`,
          exitCode: -1,
        },
      });
    });
    child.on("exit", (code, signal) => {
      if (code === 0) {
        res({ pgid });
        return;
      }
      const message = stderr.trim() || `preflight exited with signal ${signal}`;
      res({
        pgid,
        error: {
          phase: "preflight",
          message,
          exitCode: typeof code === "number" ? code : -1,
        },
      });
    });
  });
}

function allocatePort() {
  return new Promise((res, rej) => {
    const server = createServer();
    server.unref();
    server.on("error", rej);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        rej(new Error("failed to allocate port"));
        return;
      }
      const port = addr.port;
      server.close(() => res(port));
    });
  });
}

function isPortFree(port) {
  if (!port) return Promise.resolve(true);
  return new Promise((res) => {
    const socket = connect({ port, host: "127.0.0.1" }, () => {
      socket.destroy();
      res(false);
    });
    socket.on("error", () => res(true));
    socket.setTimeout(500, () => {
      socket.destroy();
      res(true);
    });
  });
}

function countDescendants(pgid) {
  if (!pgid || pgid <= 0) return Promise.resolve(0);
  return new Promise((res) => {
    const child = spawn("ps", ["-o", "pid=", "-g", String(pgid)], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.on("error", () => res(0));
    child.on("close", () => {
      const pids = out
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((s) => Number(s) !== process.pid);
      res(pids.length);
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await sleep(50);
  }
  return false;
}

/**
 * Factory function — wires real dependencies.
 * @param {ConstructorParameters<typeof WorkdirManager>[0]} deps
 * @returns {WorkdirManager}
 */
export function createWorkdirManager(deps) {
  return new WorkdirManager(deps);
}
