/**
 * WorkdirManager (spec 870 plan-a Step 4).
 *
 * Owns the per-task working directory lifecycle: creates the agent CWD,
 * copies the family-shipped task content into it (workdir/ + specs/),
 * overlays the apm staging tree, allocates a free TCP port, runs the
 * pre-flight smoke probe in its own process group, and tears down the
 * group cleanly after the run.
 *
 * The `scoring/` directory is NEVER copied — design Decision 3. Hidden
 * grading material lives only on the template path; the Scorer invokes
 * scripts there with `$WORKDIR` as an argument.
 */

import { spawn, execSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { cp } from "node:fs/promises";
import { join, dirname, sep } from "node:path";
import { createServer, connect } from "node:net";

const TEARDOWN_GRACE_MS = 5000;
const PORT_PROBE_TIMEOUT_MS = 500;
const PREFLIGHT_TIMEOUT_MS = 60000;

/**
 * @typedef {{
 *   cwd: string, port: number, pgid: number | null,
 *   scaffold: null,
 *   agentTracePath: string, judgeTracePath: string,
 *   preflightError?: { phase: string, message: string, exitCode: number },
 *   runDir: string,
 * }} Workdir
 */

async function allocateFreePort() {
  return new Promise((resolveP, rejectP) => {
    const server = createServer();
    server.unref();
    server.on("error", rejectP);
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      server.close((err) => (err ? rejectP(err) : resolveP(port)));
    });
  });
}

async function portFree(port) {
  return new Promise((resolveP) => {
    const sock = connect({ port, host: "127.0.0.1" });
    let settled = false;
    const settle = (free) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolveP(free);
    };
    sock.on("connect", () => settle(false));
    sock.on("error", () => settle(true));
    setTimeout(() => settle(true), PORT_PROBE_TIMEOUT_MS);
  });
}

function countDescendants(pgid) {
  if (!pgid) return 0;
  try {
    const out = execSync(`ps -o pid= -g ${pgid}`, { encoding: "utf8" });
    return out.split("\n").filter((line) => line.trim()).length;
  } catch {
    // `ps` absent or pgid empty — treat as best-effort.
    return 0;
  }
}

/**
 * Send a signal to a process group. Returns `false` when the group is
 * already gone (ESRCH) and the caller can skip the grace-wait.
 * @param {number} pgid
 * @param {NodeJS.Signals} sig
 */
function signalGroup(pgid, sig) {
  try {
    process.kill(-pgid, sig);
    return true;
  } catch (err) {
    if (err.code === "ESRCH") return false;
    return true;
  }
}

async function waitForGroupExit(pgid, graceMs) {
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    if (!signalGroup(pgid, 0)) return;
    await new Promise((r) => setTimeout(r, 25));
  }
}

function runPreflight(scriptPath, env) {
  return new Promise((resolveP) => {
    let child;
    try {
      child = spawn(scriptPath, [], {
        env: { ...process.env, ...env },
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      resolveP({ pgid: null, error: { message: err.message, exitCode: -1 } });
      return;
    }
    const pgid = child.pid;
    let stderr = "";
    child.stderr?.on("data", (b) => (stderr += b.toString()));
    const timer = setTimeout(() => {
      try {
        process.kill(-pgid, "SIGKILL");
      } catch {
        // already gone
      }
    }, PREFLIGHT_TIMEOUT_MS);
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolveP({ pgid, error: null });
        return;
      }
      resolveP({
        pgid,
        error: {
          message: stderr.trim() || `preflight exited ${code}`,
          exitCode: code ?? -1,
        },
      });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolveP({ pgid, error: { message: err.message, exitCode: -1 } });
    });
  });
}

/**
 * Per-task working-directory lifecycle. Owns CWD creation, port
 * allocation, preflight, and teardown.
 */
export class WorkdirManager {
  /**
   * @param {object} deps
   * @param {string} deps.stagingDir - Output of `installApm`.
   * @param {string} deps.runOutputDir - Run-output dir.
   */
  constructor({ stagingDir, runOutputDir }) {
    if (!stagingDir) throw new Error("stagingDir is required");
    if (!runOutputDir) throw new Error("runOutputDir is required");
    this.stagingDir = stagingDir;
    this.runOutputDir = runOutputDir;
  }

  /**
   * @param {import("./task-family.js").Task} task
   * @param {number} runIndex
   * @returns {Promise<Workdir>}
   */
  async start(task, runIndex) {
    const [taskFamily, taskName] = task.id.split("/");
    const runDir = join(
      this.runOutputDir,
      "runs",
      `${taskFamily}__${taskName}`,
      String(runIndex),
    );
    const cwd = join(runDir, "cwd");
    mkdirSync(cwd, { recursive: true });

    if (existsSync(task.paths.workdir)) {
      const scriptsSegment = `workdir${sep}scripts`;
      await cp(task.paths.workdir, cwd, {
        recursive: true,
        filter: (src) => !src.endsWith(scriptsSegment),
      });
    }
    if (existsSync(task.paths.specs)) {
      await cp(task.paths.specs, join(cwd, "specs"), { recursive: true });
    }
    const stagedClaude = join(this.stagingDir, ".claude");
    if (existsSync(stagedClaude)) {
      await cp(stagedClaude, join(cwd, ".claude"), { recursive: true });
    }

    const port = await allocateFreePort();
    const agentTracePath = join(runDir, "agent.ndjson");
    const judgeTracePath = join(runDir, "judge.ndjson");

    const preflightPath = join(task.paths.workdir, "scripts", "preflight.sh");
    const { pgid, error } = await runPreflight(preflightPath, {
      WORKDIR: cwd,
      PORT: String(port),
    });

    return {
      cwd,
      port,
      pgid,
      scaffold: null,
      agentTracePath,
      judgeTracePath,
      runDir,
      ...(error && {
        preflightError: { phase: "preflight", ...error },
      }),
    };
  }

  /**
   * SIGTERM the captured pgid, poll the group for liveness (up to a 5 s
   * grace), SIGKILL survivors, then verify the port is free and report
   * descendant count for the result record.
   * @param {Workdir} workdir
   * @returns {Promise<{ portFree: boolean, descendants: number }>}
   */
  async teardown(workdir) {
    if (workdir.pgid) {
      const termSignalled = signalGroup(workdir.pgid, "SIGTERM");
      if (termSignalled) {
        await waitForGroupExit(workdir.pgid, TEARDOWN_GRACE_MS);
        signalGroup(workdir.pgid, "SIGKILL");
      }
    }
    const portFreeNow = await portFree(workdir.port);
    const descendants = countDescendants(workdir.pgid);
    return { portFree: portFreeNow, descendants };
  }
}

/**
 * Return the parent run directory of a per-task CWD. The runner uses this
 * to synthesise a scorer context from a `Workdir` (plan-a P6).
 * @param {string} cwd
 * @returns {string}
 */
export function runDirOf(cwd) {
  return dirname(cwd);
}
