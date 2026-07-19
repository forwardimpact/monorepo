/**
 * `fit-benchmark grade` — run both check-row producers (the hidden test
 * suite and the invariants script) against a post-run workdir directory and
 * grade the merged rows with the same derivation the benchmark runner uses.
 * No agent and no judge run, so authors validate a task's grading material
 * against fixtures without paying for agent sessions; the process exit
 * mirrors the graded verdict.
 */

import { join, resolve } from "node:path";
import { createServer } from "node:net";

import { validateGradeRecord } from "../benchmark/result.js";
import { runInvariants } from "../benchmark/invariants.js";
import { runHiddenTests } from "../benchmark/hidden-tests.js";
import { gradeChecks, mergeRows, normalizeGrade } from "../benchmark/grade.js";
import { loadTaskFamily } from "../benchmark/task-family.js";

/**
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 * @returns {Promise<{ok: true} | {ok: false, code: number, error: string}>}
 */
export async function runBenchmarkGradeCommand(ctx) {
  const values = ctx.options;
  const runtime = ctx.deps.runtime;
  const familyInput = values.family;
  if (!familyInput)
    return { ok: false, code: 1, error: "--family is required" };
  const taskId = values.task;
  if (!taskId) return { ok: false, code: 1, error: "--task is required" };
  const runDirArg = values["run-dir"];
  if (!runDirArg) return { ok: false, code: 1, error: "--run-dir is required" };

  const family = await loadTaskFamily(familyInput, runtime);
  const task = family.tasks().find((t) => t.id === taskId);
  if (!task)
    return { ok: false, code: 1, error: `task not found in family: ${taskId}` };

  const runDir = resolve(runDirArg);
  const cwd = join(runDir, "cwd");
  const port = await allocatePort();
  const cellCtx = { cwd, port, runDir, familyDir: family.rootPath };

  const invariants = await runInvariants(task, cellCtx, runtime);
  let hidden = { details: [] };
  let engineError = null;
  try {
    hidden = await runHiddenTests(task, cellCtx, runtime);
  } catch (e) {
    engineError = e;
  }
  const rows = mergeRows(invariants.details, hidden.details);
  const healthy = invariants.exitCode === 0 && !engineError;
  const grade = normalizeGrade(gradeChecks(rows, healthy));
  // Same effective-score rule as the runner, minus the judge (none runs
  // here): an unhealthy grader or a failing gate zeroes the score, so a
  // crashed hook can never mint marks from the rows it emitted before dying.
  if (grade.score !== undefined && !(healthy && grade.gatesPass)) {
    grade.score = 0;
  }
  const record = {
    taskId: task.id,
    grade,
    invariants,
    ...(task.tests && {
      hiddenTests: {
        details: hidden.details,
        ...(engineError && { error: engineError.message }),
      },
    }),
    // Mirrors the script for diagnosis; the graded verdict drives the exit.
    exitCode: invariants.exitCode,
  };
  validateGradeRecord(record);

  const line = JSON.stringify(record) + "\n";
  if (values.output) {
    runtime.fsSync.writeFileSync(resolve(values.output), line);
  } else {
    runtime.proc.stdout.write(line);
  }
  return grade.verdict === "pass"
    ? { ok: true }
    : { ok: false, code: 1, error: "" };
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
