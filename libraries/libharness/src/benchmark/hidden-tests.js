/**
 * Hidden-test engine — executes a task's `tests/` overlay against the
 * post-run agent CWD: stage each file at its mirrored path, run each check
 * with `node --test`, convert the exit status into one check row, and
 * restore the tree so the judge sees the workdir exactly as the agent left
 * it.
 *
 * Fault attribution is the engine's contract: a stage or spawn failure (the
 * agent deleted the scaffold) is a *failing row* — agent fault; the engine
 * itself throwing is grader fault, which the caller records as unhealthy so
 * a crashed grader can never mint marks.
 */

import { dirname, join } from "node:path";

import { buildHookEnv } from "./hook-env.js";

// Fixed per-check budget. A wedged test process runs outside the agent
// watchdog, so this bound is what keeps a hung hidden test from stalling the
// cell; the timeout row keeps the failure visible.
const CHECK_TIMEOUT_MS = 120_000;
const STDERR_TAIL_CHARS = 500;

/**
 * Run the task's hidden test suite.
 * @param {import("./task-family.js").Task} task
 * @param {{cwd: string, port: number, runDir: string, familyDir?: string|null}} ctx
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @param {{timeoutMs?: number}} [opts] - Test seam for the per-check timeout.
 * @returns {Promise<{details: object[]}>}
 */
export async function runHiddenTests(task, ctx, runtime, opts = {}) {
  if (!runtime) throw new Error("runtime is required");
  if (!task.tests) return { details: [] };
  const timeoutMs = opts.timeoutMs ?? CHECK_TIMEOUT_MS;
  const fs = runtime.fs;
  const details = [];
  const supportStager = newStager();
  try {
    for (const file of task.tests.support) {
      await stageFile(fs, ctx.cwd, supportStager, file);
    }
    for (const check of task.tests.checks) {
      details.push(await runOneCheck(task, ctx, runtime, timeoutMs, check));
    }
  } finally {
    await unstage(fs, supportStager);
  }
  return { details };
}

/**
 * Stage one check, run it, and restore its staging — the check's own row is
 * the only trace it leaves. A stage failure is the agent's fault (a deleted
 * scaffold), so it becomes a failing row rather than a throw.
 */
async function runOneCheck(task, ctx, runtime, timeoutMs, check) {
  const stager = newStager();
  try {
    try {
      await stageFile(runtime.fs, ctx.cwd, stager, check);
    } catch (e) {
      return checkRow(check, false, `stage failed: ${e.message}`);
    }
    return await spawnCheck(task, ctx, runtime, timeoutMs, check);
  } finally {
    await unstage(runtime.fs, stager);
  }
}

/**
 * Spawn `node --test <staged path>` from the agent CWD under the hook env
 * and map the exit status onto one row. The clock timer SIGKILLs a child
 * that outlives the per-check budget; the row fails with a timeout message.
 */
async function spawnCheck(task, ctx, runtime, timeoutMs, check) {
  const env = buildHookEnv(runtime.proc.env, {
    cwd: ctx.cwd,
    port: ctx.port,
    taskId: task.id,
    taskDir: task.paths.taskDir,
    hooksDir: task.paths.hooks,
    familyDir: ctx.familyDir,
  });
  // An inherited test-runner context makes the child `node --test` report
  // exit 0 even when its tests fail — a failing check would mint a passing
  // row whenever the harness itself runs under `node --test`.
  delete env.NODE_TEST_CONTEXT;
  const child = runtime.subprocess.spawn("node", ["--test", check.stagePath], {
    cwd: ctx.cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let timedOut = false;
  const timer = runtime.clock.setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, timeoutMs);
  const drainStdout = (async () => {
    for await (const _chunk of child.stdout) {
      // discard
    }
  })();
  let stderr = "";
  for await (const chunk of child.stderr) stderr += chunk.toString();
  await drainStdout;
  const exit = await child.exitCode;
  runtime.clock.clearTimeout(timer);

  if (timedOut) {
    return checkRow(check, false, `timed out after ${timeoutMs}ms`);
  }
  if (exit === 0) return checkRow(check, true);
  const tail = stderr.trim().slice(-STDERR_TAIL_CHARS);
  return checkRow(check, false, `exit ${exit}${tail ? `: ${tail}` : ""}`);
}

function checkRow(check, pass, message) {
  return {
    test: check.name,
    pass,
    ...(check.gate && { gate: true }),
    ...(message && { message }),
  };
}

function newStager() {
  return { staged: [], backups: [], createdDirs: [] };
}

/**
 * Copy the symlink-resolved source to its mirrored path under the agent CWD,
 * backing up a collided file's bytes and tracking every directory created so
 * `unstage` can put the tree back exactly.
 */
async function stageFile(fs, cwd, stager, { sourcePath, stagePath }) {
  const target = join(cwd, stagePath);
  let collided = null;
  try {
    collided = await fs.readFile(target);
  } catch {
    // no collision
  }
  if (collided !== null) stager.backups.push({ target, bytes: collided });
  await ensureParents(fs, cwd, stager, dirname(target));
  const resolved = await fs.realpath(sourcePath);
  await fs.copyFile(resolved, target);
  stager.staged.push(target);
}

async function ensureParents(fs, cwd, stager, dir) {
  if (dir === cwd) return;
  try {
    await fs.access(dir);
    return;
  } catch {
    // missing — create below
  }
  await ensureParents(fs, cwd, stager, dirname(dir));
  await fs.mkdir(dir);
  stager.createdDirs.push(dir);
}

/**
 * Reverse the staging: staged copies out, collided bytes back, created
 * directories removed (deepest first — a check's own artifacts inside a
 * created directory go with it, since that directory did not exist when the
 * agent finished).
 */
async function unstage(fs, stager) {
  for (const target of stager.staged) {
    await fs.rm(target, { force: true });
  }
  for (const backup of stager.backups) {
    await fs.writeFile(backup.target, backup.bytes);
  }
  for (const dir of [...stager.createdDirs].reverse()) {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
