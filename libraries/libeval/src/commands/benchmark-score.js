/**
 * `fit-benchmark score` — score a single task against a post-run workdir
 * directory without invoking an agent (P6/P7). Useful for re-scoring an
 * agent's output against revised grading material.
 */

import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "node:net";

import { validateScoringRecord } from "../benchmark/result.js";
import { runScoring } from "../benchmark/scorer.js";
import { loadTaskFamily } from "../benchmark/task-family.js";

/**
 * @param {object} values
 * @param {string[]} _args
 */
export async function runBenchmarkScoreCommand(values, _args) {
  const familyInput = values.family;
  if (!familyInput) throw new Error("--family is required");
  const taskId = values.task;
  if (!taskId) throw new Error("--task is required");
  const workdirArg = values.workdir;
  if (!workdirArg) throw new Error("--workdir is required");

  const family = await loadTaskFamily(familyInput);
  const task = family.tasks().find((t) => t.id === taskId);
  if (!task) throw new Error(`task not found in family: ${taskId}`);

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
    writeFileSync(resolve(values.output), line);
  } else {
    process.stdout.write(line);
  }
  process.exit(scoring.verdict === "pass" ? 0 : 1);
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
