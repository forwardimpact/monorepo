/**
 * `fit-benchmark invariants` — check a single task's invariants against a
 * post-run workdir directory without invoking an agent (P6/P7). Useful for
 * re-checking an agent's output against revised grading material.
 */

import { join, resolve } from "node:path";
import { createServer } from "node:net";

import { validateInvariantsRecord } from "../benchmark/result.js";
import { runInvariants } from "../benchmark/invariants.js";
import { loadTaskFamily } from "../benchmark/task-family.js";

/**
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 * @returns {Promise<{ok: true} | {ok: false, code: number, error: string}>}
 */
export async function runBenchmarkInvariantsCommand(ctx) {
  const values = ctx.options;
  const runtime = ctx.deps.runtime;
  const familyInput = values.family;
  if (!familyInput)
    return { ok: false, code: 1, error: "--family is required" };
  const taskId = values.task;
  if (!taskId) return { ok: false, code: 1, error: "--task is required" };
  const workdirArg = values.workdir;
  if (!workdirArg)
    return { ok: false, code: 1, error: "--workdir is required" };

  const family = await loadTaskFamily(familyInput, runtime);
  const task = family.tasks().find((t) => t.id === taskId);
  if (!task)
    return { ok: false, code: 1, error: `task not found in family: ${taskId}` };

  const runDir = resolve(workdirArg);
  const cwd = join(runDir, "cwd");
  const port = await allocatePort();

  const invariants = await runInvariants(task, { cwd, port, runDir }, runtime);
  const record = {
    taskId: task.id,
    invariants,
    exitCode: invariants.exitCode,
  };
  validateInvariantsRecord(record);

  const line = JSON.stringify(record) + "\n";
  if (values.output) {
    runtime.fsSync.writeFileSync(resolve(values.output), line);
  } else {
    runtime.proc.stdout.write(line);
  }
  return invariants.verdict === "pass"
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
