/**
 * Hidden-test engine — runs a task's `tests/` overlay against the post-run
 * agent CWD. The engine stages each file at its mirrored path. It runs each
 * check with `bun test`. It converts the exit status into one check row.
 * It restores the tree, so the judge sees the workdir exactly as the agent
 * left it.
 *
 * Fault attribution is the engine's contract. A stage or spawn failure (the
 * agent deleted the scaffold) is agent fault, so the engine returns a *row
 * that fails*. A throw from the engine itself is grader fault. The caller
 * records that as unhealthy, so a crashed grader can never mint marks.
 */

import { dirname, join } from "node:path";

import { buildHookEnv } from "./hook-env.js";

// Fixed per-check budget. A wedged test process runs outside the agent
// watchdog. Without this bound, a hung hidden test would stall the cell. The
// timeout row keeps the failure visible.
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
 * Stage one check, run it, then put the tree back. The check's own row is the
 * only trace it leaves. A stage failure is the agent's fault (a deleted
 * scaffold). The engine returns a row that fails. It does not throw.
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
 * Reads a child pipe to a string. Returns what it read when the stream tears
 * down mid-read, because a pipe that closes as the child exits is a race, not
 * a check failure. The caller reads the exit code for the verdict.
 *
 * @param {import("node:stream").Readable} stream - Child stdout or stderr.
 * @returns {Promise<string>} Everything read before the stream ended.
 */
async function drainQuietly(stream) {
  let out = "";
  try {
    for await (const chunk of stream) out += chunk.toString();
  } catch {
    // The stream closed under us. Keep what arrived.
  }
  return out;
}

/**
 * Spawn `bun test <staged path>` from the agent CWD under the hook env
 * and map the exit status onto one row. The clock timer SIGKILLs a child
 * that outlives the per-check budget. The row then fails with a timeout
 * message.
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
  // `bun test` sets no test-context variable that a nested run inherits, so
  // a child reports its own exit status even when the harness itself runs
  // under a test runner. That removes the `NODE_TEST_CONTEXT` scrub the
  // `node --test` engine needed to stop a failing check minting a passing
  // row. The "fractional score" grade test is the standing guard: it fails
  // if a failing check ever reports success again.
  //
  // Pass the ABSOLUTE staged path. `bun test` reads its argument as a
  // substring filter over discovered paths, not as one file, so the relative
  // `app/test/x.test.js` also matches an agent-authored `sub/app/test/
  // x.test.js` and folds that file's result into this check's row. An
  // absolute path cannot be a substring of a deeper path, so it selects
  // exactly the staged file. One `*.test.js` stays one check.
  const child = runtime.subprocess.spawn(
    "bun",
    ["test", join(ctx.cwd, check.stagePath)],
    {
      cwd: ctx.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let timedOut = false;
  const timer = runtime.clock.setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, timeoutMs);
  // Both pipes drain only so a chatty child never blocks on a full pipe.
  // A child that exits while its pipe is still open makes the async iterator
  // reject with ERR_STREAM_PREMATURE_CLOSE on some runtimes. That teardown
  // race is not a check result, so it must not throw out of the check. The
  // exit code below is the verdict.
  const drainStdout = drainQuietly(child.stdout);
  const stderr = await drainQuietly(child.stderr);
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
 * Copy the symlink-resolved source to its mirrored path under the agent CWD.
 * Back up the bytes of a collided file. Track every directory created, so
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
    // missing, so create it below
  }
  await ensureParents(fs, cwd, stager, dirname(dir));
  await fs.mkdir(dir);
  stager.createdDirs.push(dir);
}

/**
 * Reverse the stage step. Remove the staged copies. Write the collided bytes
 * back. Remove the created directories, deepest first. A check's own
 * artifacts inside a created directory go with it, because that directory did
 * not exist when the agent finished.
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
