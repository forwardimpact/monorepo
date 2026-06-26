/**
 * WorkdirManager — per-task lifecycle: create the agent CWD, seed it from the
 * task's workdir + specs + staged .claude/, allocate a free TCP port, run
 * the pre-flight smoke probe, and tear down the process group at end of run.
 *
 * The Workdir handle threads `cwd`, `port`, `pgid`, and trace paths through
 * runAgent → invariants → judge → teardown.
 *
 * Filesystem, subprocess, clock, and process-signal access all route through
 * the injected `runtime` bag. Only raw TCP plumbing (`node:net`) stays direct —
 * it is not an ambient-dependency smell and the runtime bag models no socket
 * surface.
 */

import { createServer } from "node:net";
import { connect } from "node:net";
import { join } from "node:path";

import { loadEnv } from "./env-loader.js";
import { buildHookEnv } from "./hook-env.js";

const DEFAULT_TERM_GRACE_MS = 5_000;

/**
 * @typedef {object} Workdir
 * @property {string} cwd - Agent CWD (per-task copy).
 * @property {string} runDir - Parent of `cwd`; holds trace/log siblings.
 * @property {number} port - Allocated TCP port for the agent.
 * @property {number} pgid - Process-group id captured from the preflight child.
 * @property {*} scaffold - Reserved per design § Components; v1 sets null.
 * @property {string} agentTracePath
 * @property {string} supervisorTracePath
 * @property {string} judgeTracePath
 * @property {string[]} [envNames] - Env var names loaded from .env files.
 * @property {{phase: string, message: string, exitCode: number}} [preflightError]
 */

/** Per-task workdir lifecycle: seed → preflight → teardown. */
export class WorkdirManager {
  /**
   * @param {object} deps
   * @param {string} deps.stagingDir - Output of `installApm(...)`.
   * @param {string} deps.runOutputDir - Root run-output directory (parent of `runs/`).
   * @param {import("@forwardimpact/libutil/runtime").Runtime} deps.runtime -
   *   Ambient collaborators; uses `fs`, `subprocess`, `clock`, `proc`.
   */
  constructor({
    stagingDir,
    runOutputDir,
    termGraceMs,
    familyRootPath,
    runtime,
  }) {
    if (!stagingDir) throw new Error("stagingDir is required");
    if (!runOutputDir) throw new Error("runOutputDir is required");
    if (!runtime) throw new Error("runtime is required");
    this.stagingDir = stagingDir;
    this.runOutputDir = runOutputDir;
    this.termGraceMs = termGraceMs ?? DEFAULT_TERM_GRACE_MS;
    this.familyRootPath = familyRootPath ?? null;
    this.runtime = runtime;
  }

  /**
   * Create the per-task working directory and run the pre-flight probe.
   * @param {import("./task-family.js").Task} task
   * @param {number} runIndex
   * @returns {Promise<Workdir>}
   */
  async start(task, runIndex) {
    const fs = this.runtime.fs;
    const slug = task.id.replace("/", "__");
    const runDir = join(this.runOutputDir, "runs", slug, String(runIndex));
    const cwd = join(runDir, "cwd");
    await fs.mkdir(cwd, { recursive: true });

    // Family-level shared fixtures: convention-over-configuration, copied if
    // present. They form the shared base; the per-task workdir/specs below
    // overlay on top (fs.cp defaults to force:true, so a per-task file wins).
    if (this.familyRootPath) {
      await fs
        .cp(join(this.familyRootPath, "workdir"), cwd, { recursive: true })
        .catch((e) => {
          if (e.code !== "ENOENT") throw e;
        });
      await fs
        .cp(join(this.familyRootPath, "specs"), join(cwd, "specs"), {
          recursive: true,
        })
        .catch((e) => {
          if (e.code !== "ENOENT") throw e;
        });
    }

    await fs.cp(task.paths.workdir, cwd, { recursive: true }).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
    await fs
      .cp(task.paths.specs, join(cwd, "specs"), {
        recursive: true,
      })
      .catch((e) => {
        if (e.code !== "ENOENT") throw e;
      });
    await fs.cp(join(this.stagingDir, ".claude"), join(cwd, ".claude"), {
      recursive: true,
    });
    await fs
      .cp(join(this.stagingDir, "node_modules"), join(cwd, "node_modules"), {
        recursive: true,
      })
      .catch((e) => {
        if (e.code !== "ENOENT") throw e;
      });

    const envDirs = [
      ...(this.familyRootPath ? [this.familyRootPath] : []),
      ...(task.paths.taskDir ? [task.paths.taskDir] : []),
    ];
    const envNames =
      envDirs.length > 0 ? await loadEnv(envDirs, cwd, this.runtime) : [];

    const port = await allocatePort();
    const agentTracePath = join(runDir, "agent.ndjson");
    const supervisorTracePath = join(runDir, "supervisor.ndjson");
    const judgeTracePath = join(runDir, "judge.ndjson");

    const preflight = task.paths.preflight
      ? await runPreflight(this.runtime, task.paths.preflight, cwd, port, {
          taskId: task.id,
          taskDir: task.paths.taskDir,
          hooksDir: task.paths.hooks,
          familyDir: this.familyRootPath,
        })
      : { pgid: 0 };

    return {
      cwd,
      runDir,
      port,
      pgid: preflight.pgid,
      scaffold: null,
      agentTracePath,
      supervisorTracePath,
      judgeTracePath,
      envNames,
      ...(preflight.error && { preflightError: preflight.error }),
    };
  }

  /**
   * Tear down the per-task process group: SIGTERM, wait, SIGKILL, then probe.
   * @param {Workdir} workdir
   * @returns {Promise<{portFree: boolean, descendants: number}>}
   */
  async teardown(workdir) {
    const { proc, clock } = this.runtime;
    if (workdir.pgid && workdir.pgid > 0) {
      try {
        proc.kill(-workdir.pgid, "SIGTERM");
      } catch {
        // Process group already gone — fine.
      }
      await clock.sleep(this.termGraceMs);
      try {
        proc.kill(-workdir.pgid, "SIGKILL");
      } catch {
        // Already exited.
      }
      // Poll briefly until the process group is empty — SIGKILL returns
      // before the kernel finishes reaping descendants.
      await waitFor(
        this.runtime,
        async () => (await countDescendants(this.runtime, workdir.pgid)) === 0,
        2_000,
      );
    }
    const portFree = await isPortFree(workdir.port);
    const descendants = await countDescendants(this.runtime, workdir.pgid);
    return { portFree, descendants };
  }
}

/**
 * Spawn preflight. Stays detached so we can SIGTERM the whole process group.
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @param {string} script
 * @param {string} cwd - Agent CWD passed via $AGENT_CWD.
 * @param {number} port - Free TCP port passed via $PORT.
 * @param {{taskId: string, taskDir: string, hooksDir: string, familyDir: string|null}} vars - Extra hook env vars.
 * @returns {Promise<{pgid: number, error?: {phase: string, message: string, exitCode: number}}>}
 */
async function runPreflight(runtime, script, cwd, port, vars) {
  const child = runtime.subprocess.spawn(script, [], {
    cwd,
    env: buildHookEnv(runtime.proc.env, { cwd, port, ...vars }),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (child.pid === undefined) {
    throw new Error(`failed to spawn preflight: ${script}`);
  }
  const pgid = child.pid;
  let stderr = "";
  const drainStdout = (async () => {
    for await (const _chunk of child.stdout) {
      // discard
    }
  })();
  for await (const chunk of child.stderr) stderr += chunk.toString();
  await drainStdout;
  const code = await child.exitCode;
  if (code === 0) return { pgid };
  const message = stderr.trim() || `preflight exited with code ${code}`;
  return {
    pgid,
    error: {
      phase: "preflight",
      message,
      exitCode: typeof code === "number" ? code : -1,
    },
  };
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

async function countDescendants(runtime, pgid) {
  if (!pgid || pgid <= 0) return 0;
  const child = runtime.subprocess.spawn(
    "ps",
    ["-o", "pid=", "-g", String(pgid)],
    {
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  let out = "";
  try {
    for await (const chunk of child.stdout) out += chunk.toString();
    await child.exitCode;
  } catch {
    return 0;
  }
  const pids = out
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => Number(s) !== runtime.proc.pid);
  return pids.length;
}

async function waitFor(runtime, predicate, timeoutMs) {
  const deadline = runtime.clock.now() + timeoutMs;
  while (runtime.clock.now() < deadline) {
    if (await predicate()) return true;
    await runtime.clock.sleep(50);
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
