/**
 * `fit-benchmark score` handler (spec 870 plan-a Step 10, P6/P7).
 *
 * Ad-hoc scoring path: loads the family, picks one `Task` by id, runs
 * the scoring script against a post-run workdir (the agent already ran),
 * and writes a `ScoringRecord` JSONL line.
 *
 * The handler synthesises a scorer ctx from `--workdir` (P6): the
 * directory layout matches `WorkdirManager.start` output, so
 * `<workdir>/cwd` is the agent CWD and `<workdir>` itself is the runDir.
 */

import { resolve, join } from "node:path";
import { appendFileSync } from "node:fs";
import { loadTaskFamily } from "../benchmark/task-family.js";
import { runScoring } from "../benchmark/scorer.js";
import { validateScoringRecord } from "../benchmark/result.js";
import { createServer } from "node:net";

async function allocatePort() {
  return new Promise((resolveP, rejectP) => {
    const s = createServer();
    s.unref();
    s.on("error", rejectP);
    s.listen(0, () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      s.close((err) => (err ? rejectP(err) : resolveP(port)));
    });
  });
}

/**
 * @param {object} values
 * @param {string[]} _args
 */
export async function runBenchmarkScoreCommand(values, _args) {
  const familyArg = values.family;
  const taskId = values.task;
  const workdirArg = values.workdir;
  if (!familyArg) throw new Error("--family is required");
  if (!taskId) throw new Error("--task is required (METR id `tf/name`)");
  if (!workdirArg) throw new Error("--workdir is required");

  const family = await loadTaskFamily(familyArg);
  const task = Array.from(family.tasks()).find((t) => t.id === taskId);
  if (!task) {
    throw new Error(
      `Task not found in family: ${taskId}. ` +
        `Available: ${Array.from(family.tasks())
          .map((t) => t.id)
          .join(", ")}`,
    );
  }

  const runDir = resolve(workdirArg);
  const cwd = join(runDir, "cwd");
  const port = await allocatePort();
  const scoring = await runScoring(task, { cwd, port, runDir });
  const record = {
    taskId: task.id,
    scoring,
    exitCode: scoring.exitCode,
  };
  validateScoringRecord(record);

  const line = JSON.stringify(record) + "\n";
  if (values.output) {
    appendFileSync(resolve(values.output), line);
  } else {
    process.stdout.write(line);
  }
  process.exit(scoring.verdict === "pass" ? 0 : 1);
}
