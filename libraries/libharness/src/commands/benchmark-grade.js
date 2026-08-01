/**
 * `gemba-benchmark grade` — run both check-row producers (the hidden test
 * suite and the invariants script) against a post-run workdir directory.
 * Grade the merged rows with the same derivation the benchmark runner uses.
 * No agent runs and no judge runs. So an author validates a task's grading
 * material against fixtures, and pays for no agent session. The process exit
 * mirrors the graded verdict.
 */

import { join, resolve } from "node:path";

import { validateGradeRecord } from "../benchmark/result.js";
import { runInvariants } from "../benchmark/invariants.js";
import { runHiddenTests } from "../benchmark/hidden-tests.js";
import { runProducersAndGrade } from "../benchmark/grade.js";
import { loadTaskFamily } from "../benchmark/task-family.js";
import { probeFreePort } from "../benchmark/workdir.js";

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
  const port = await probeFreePort();
  const cellCtx = { cwd, port, runDir, familyDir: family.rootPath };

  const { invariants, hiddenRows, engineError, healthy, grade } =
    await runProducersAndGrade(task, cellCtx, runtime, {
      runInvariants,
      runHiddenTests,
    });
  // The effective-score rule matches the runner, minus the judge (none runs
  // here). An unhealthy grader or a gate that fails zeroes the score. So a
  // crashed hook can never mint marks from the rows it emitted before it
  // died. A runner record keeps the raw fraction in `grade.score` and zeroes
  // the top-level `score` instead. This record has no second field, so
  // `grade.score` carries the effective value here.
  if (grade.score !== undefined && !(healthy && grade.gatesPass)) {
    grade.score = 0;
  }
  const record = {
    taskId: task.id,
    grade,
    invariants,
    ...(task.tests && {
      hiddenTests: {
        details: hiddenRows,
        ...(engineError && { error: engineError.message }),
      },
    }),
    // This mirrors the script for diagnosis. The graded verdict drives the
    // exit.
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
