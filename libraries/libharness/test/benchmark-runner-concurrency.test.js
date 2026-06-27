/**
 * In-process concurrency coverage for `BenchmarkRunner`. The agent-under-test
 * and judge are injected seams so no SDK runs; the fixture family supplies real
 * tasks + preflight scripts.
 *
 * Why a high-water-mark instead of a wall-clock assertion: the mock clock
 * advances one shared virtual `now` and resolves `sleep` on the next microtask,
 * so concurrent cells do not overlap in virtual time. Boundedness is therefore
 * asserted via a **max-in-flight high-water-mark** maintained by the fake-agent
 * seam. The "stall costs one slot" property splits into two checks: an injected
 * short `watchdogMs` proves a hung agent session becomes an `agentError` (real
 * watchdog path), and a hook-based slow cell proves a stall occupies one slot
 * while others complete.
 */

import { describe, test, before } from "node:test";
import assert from "node:assert";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { createApmInstaller } from "../src/benchmark/apm-installer.js";
import { aggregate } from "../src/benchmark/report.js";
import { BenchmarkRunner } from "../src/benchmark/runner.js";
import { validateResultRecord } from "../src/benchmark/result.js";
import { resolveConcurrency } from "../src/commands/benchmark-run.js";
import { realRuntimeWithSubprocess } from "./real-runtime.js";

const RT = createDefaultRuntime();
const FIXTURE = new URL("./fixtures/benchmark-family/", import.meta.url)
  .pathname;

const mockInstallApm = (family, outputDir) =>
  createApmInstaller({ runtime: realRuntimeWithSubprocess() }).install(
    family,
    outputDir,
  );

/** A passing agent seam that writes a minimal trace. */
async function passingAgent(_task, workdir) {
  const submission = "done";
  await writeFile(workdir.agentTracePath, "");
  await writeFile(workdir.supervisorTracePath, "");
  return { costUsd: 0.01, turns: 1, submission };
}

async function mockRunJudge(_task, workdir, invariants) {
  await writeFile(workdir.judgeTracePath, "");
  return {
    verdict: invariants.verdict === "pass" ? "pass" : "fail",
    summary: "ok",
  };
}

async function newRunner(overrides = {}) {
  const out = await mkdtemp(join(tmpdir(), "benchmark-conc-"));
  const runner = new BenchmarkRunner({
    family: FIXTURE,
    runs: overrides.runs ?? 2,
    output: out,
    agentModel: "claude-sonnet-4-6",
    supervisorModel: "claude-fable-5",
    judgeModel: "claude-fable-5",
    profiles: { agent: null, judge: "judge" },
    query: overrides.query ?? async function* () {},
    runtime: RT,
    runJudge: mockRunJudge,
    installApm: mockInstallApm,
    installNpm: async () => {},
    termGraceMs: 100,
    ...overrides,
  });
  return { runner, out };
}

async function collect(runner) {
  const records = [];
  for await (const r of runner.run()) records.push(r);
  return records;
}

/**
 * Deterministic overlap barrier. Each `enter()` bumps the in-flight count,
 * records the high-water mark, and blocks until `target` calls are
 * simultaneously in flight (then all release) or a safety timeout fires. A
 * blocked agent holds its scheduler slot, so the scheduler fills up to its
 * bound and `target` overlap is reached without racing a fixed sleep against
 * CI-variable setup/teardown I/O — the source of the earlier flakiness.
 */
function overlapBarrier(target) {
  let inFlight = 0;
  let highWater = 0;
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  const safety = setTimeout(() => release(), 5000);
  safety.unref?.();
  return {
    get highWater() {
      return highWater;
    },
    async enter() {
      inFlight++;
      highWater = Math.max(highWater, inFlight);
      if (inFlight >= target) {
        clearTimeout(safety);
        release();
      }
      await gate;
      inFlight--;
    },
  };
}

describe("BenchmarkRunner Layer-1 concurrency", () => {
  test("on by default: the resolved default concurrency runs cells in parallel", {
    timeout: 30_000,
  }, async () => {
    const concurrency = resolveConcurrency({});
    assert.ok(concurrency > 1, "default concurrency must be > 1");
    const bar = overlapBarrier(2); // prove ≥2 cells overlap
    const trackingAgent = (task, workdir) =>
      bar.enter().then(() => passingAgent(task, workdir));
    const { runner } = await newRunner({
      runs: 3,
      concurrency,
      runAgent: trackingAgent,
    });
    await collect(runner);
    assert.ok(
      bar.highWater > 1,
      `expected parallel execution, got ${bar.highWater}`,
    );
  });

  test("bounded by C: max-in-flight never exceeds the configured concurrency", {
    timeout: 30_000,
  }, async () => {
    const C = 2;
    // Barrier target = C: blocked agents hold their slots until exactly C
    // overlap, so the bound is both reached and never exceeded — deterministic.
    const bar = overlapBarrier(C);
    const trackingAgent = (task, workdir) =>
      bar.enter().then(() => passingAgent(task, workdir));
    const { runner } = await newRunner({
      runs: 3,
      concurrency: C,
      runAgent: trackingAgent,
    });
    await collect(runner);
    assert.ok(
      bar.highWater <= C,
      `max-in-flight ${bar.highWater} exceeded C=${C}`,
    );
    assert.strictEqual(bar.highWater, C, "the bound should be reached");
  });

  test("verdict unchanged: C=1 and C=8 produce identical pass@k and per-task n/c", {
    timeout: 60_000,
  }, async () => {
    const reportFor = async (concurrency) => {
      const { runner, out } = await newRunner({
        runs: 3,
        concurrency,
        runAgent: passingAgent,
      });
      await collect(runner);
      return aggregate({ inputDir: out, kValues: [1, 3], runtime: RT });
    };
    const r1 = await reportFor(1);
    const r8 = await reportFor(8);
    const shape = (r) =>
      r.tasks.map((t) => ({
        taskId: t.taskId,
        n: t.n,
        c: t.c,
        passAtK: t.passAtK,
      }));
    assert.deepStrictEqual(shape(r1), shape(r8));
  });

  test("one valid record per cell under concurrency, none interleaved", {
    timeout: 30_000,
  }, async () => {
    const { runner, out } = await newRunner({
      runs: 2,
      concurrency: 8,
      runAgent: passingAgent,
    });
    const records = await collect(runner);
    // 4 fixture tasks × 2 runs = 8 cells.
    assert.strictEqual(records.length, 8);
    for (const r of records) assert.doesNotThrow(() => validateResultRecord(r));
    const jsonl = await readFile(join(out, "results.jsonl"), "utf8");
    const lines = jsonl.split("\n").filter(Boolean);
    assert.strictEqual(lines.length, 8, "one ledger line per cell");
    for (const line of lines) {
      const parsed = JSON.parse(line); // none truncated/interleaved
      assert.doesNotThrow(() => validateResultRecord(parsed));
    }
    const keys = records.map((r) => `${r.taskId}#${r.runIndex}`);
    assert.strictEqual(new Set(keys).size, keys.length);
  });

  test("an injected short watchdogMs turns a hung agent session into an agentError", {
    timeout: 30_000,
  }, async () => {
    // No runAgent hook → the real #runAgent runs; a query whose iterator never
    // settles hangs supervisor.run(), so the watchdog (50 ms here) fires.
    const hangingQuery = () => ({
      async *[Symbol.asyncIterator]() {
        await new Promise(() => {});
      },
    });
    const { runner } = await newRunner({
      runs: 1,
      concurrency: 2,
      watchdogMs: 50,
      query: hangingQuery,
      task: "pass",
    });
    const records = await collect(runner);
    assert.strictEqual(records.length, 1);
    assert.ok(records[0].agentError, "expected an agentError from the stall");
    assert.match(records[0].agentError.message, /no result within 50ms/);
  });

  test("a stalled cell costs one slot, not the run", {
    timeout: 30_000,
  }, async () => {
    // One task's agent stalls until a healthy cell has completed, then records
    // an agentError; the rest resolve immediately. With C>1 the stalled cell
    // holds one slot while the others finish and the run completes —
    // deterministic via a completion signal, not a fixed sleep.
    const completionOrder = [];
    let signalFast;
    const aFastCellDone = new Promise((r) => {
      signalFast = r;
    });
    const stallingAgent = async (task, workdir) => {
      await writeFile(workdir.agentTracePath, "");
      await writeFile(workdir.supervisorTracePath, "");
      if (task.id === "repo-state") {
        // Hold this slot until a fast cell has finished (safety-capped).
        await Promise.race([
          aFastCellDone,
          new Promise((r) => setTimeout(r, 5000)),
        ]);
        completionOrder.push(task.id);
        return {
          costUsd: 0,
          turns: 0,
          submission: "",
          agentError: { message: "simulated stall", aborted: false },
        };
      }
      completionOrder.push(task.id);
      signalFast();
      return passingAgent(task, workdir);
    };
    const { runner } = await newRunner({
      runs: 1,
      concurrency: 4,
      runAgent: stallingAgent,
    });
    const records = await collect(runner);
    const stalled = records.find((r) => r.taskId === "repo-state");
    assert.ok(stalled.agentError, "stalled cell must record an agentError");
    // The run completed: every task produced a record.
    assert.ok(records.length >= 4);
    // A fast cell finished before the slow one — the stall held one slot only.
    assert.ok(
      completionOrder.indexOf("repo-state") > 0,
      "a non-stalled cell should complete before the stalled one",
    );
  });
});
