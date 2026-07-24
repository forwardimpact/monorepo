/**
 * BenchmarkRunner — sole orchestrator for a task-family benchmark run.
 *
 * Phases per (task, runIndex):
 *   1. WorkdirManager.start → seed CWD + run pre-flight probe
 *   2. Supervisor session (agent + supervisor) → produce traces + submission
 *   3. Invariants collector + hidden-test engine → merged check rows,
 *      graded by `gradeChecks` (rows are authoritative; script exit is
 *      grader health only)
 *   4. Judge.runJudge → Conclude-driven binary gate mapped to pass/fail
 *   5. WorkdirManager.teardown → process-group cleanup
 *
 * Cells run with bounded in-process concurrency (`CellScheduler`); `run()`
 * yields records in **completion order**, not grid order. A single drain loop
 * is the sole writer of `<output>/results.jsonl`, appending each record the
 * moment its cell settles — that incremental append is the durability and
 * crash-safety mechanism, so a killed run keeps every completed cell and there
 * is no sidecar ledger. The iterator drives CLI stdout mirroring off the same
 * stream.
 */

import { join, relative, resolve as resolvePath } from "node:path";

import { DEFAULT_ENV_ALLOWLIST, createRedactor } from "../redaction.js";
import { createSupervisor } from "../supervisor.js";
import { splitTrace } from "../trace-split.js";
import { installApm as defaultInstallApm } from "./apm-installer.js";
import { installNpm as defaultInstallNpm } from "./npm-installer.js";
import { runJudge } from "./judge.js";
import { validateResultRecord } from "./result.js";
import { runInvariants } from "./invariants.js";
import { runHiddenTests } from "./hidden-tests.js";
import { runProducersAndGrade } from "./grade.js";
import { summarizeRawTrace } from "./raw-summary.js";
import { assertJudgeProfileStaged, loadTaskFamily } from "./task-family.js";
import { createWorkdirManager } from "./workdir.js";
import { CellScheduler } from "./scheduler.js";

const BASE_TOOLS = [
  "Bash",
  "Read",
  "Glob",
  "Grep",
  "Write",
  "Edit",
  "Agent",
  "TodoWrite",
];

// Upper bound on a single supervised agent run. A run that produces no terminal
// message within this window is treated as a stall and recorded as an
// agentError, so the benchmark never hangs the event loop into a silent exit.
// Overridable per-runner via `watchdogMs` so a test can force a stall to fire
// without waiting the full 20 minutes.
const AGENT_WATCHDOG_MS = 20 * 60 * 1000;

/** Sole orchestrator for a task-family benchmark run. */
export class BenchmarkRunner {
  /**
   * @param {object} opts
   * @param {import("./task-family.js").TaskFamily | string} opts.family
   * @param {number} opts.runs - Runs per task (≥ 1).
   * @param {string} opts.output - Run-output directory.
   * @param {string} opts.agentModel
   * @param {string} opts.supervisorModel
   * @param {string} opts.judgeModel
   * @param {{agent?: string, judge?: string}} [opts.profiles]
   * @param {Function} opts.query - SDK query (injected for testability).
   * @param {string[]} [opts.allowedTools] - Agent tool allowlist (default: BASE_TOOLS).
   * @param {number} [opts.maxTurns] - Agent-under-test turn budget.
   * @param {number} [opts.concurrency] - Max cells in flight (integer ≥ 1).
   *   Defaults to 1 as a defensive floor; the CLI always passes a resolved value.
   * @param {{index: number, total: number}} [opts.shard] - Run only the cells
   *   assigned to shard `index` of `total` (1-based). Absent ≡ the whole grid
   *   (identity `1/1`).
   * @param {number} [opts.watchdogMs] - Per-agent stall watchdog (ms). Defaults
   *   to `AGENT_WATCHDOG_MS`; injectable so tests can force a stall in-test.
   * @param {number} [opts.termGraceMs] - SIGTERM→SIGKILL grace (ms) for the per-task process group.
   * @param {Function} [opts.runAgent] - Test seam: replaces the agent-under-test
   *   session. Must run the session, stream `{source, seq, event}` envelopes
   *   to `workdir.rawTracePath`, and return `{agentError?}` — cost, turns,
   *   and submission are always derived from the raw file by the shared
   *   split/summary pipeline, so the seam exercises the real path. Internal
   *   testing only — not part of the public API.
   * @param {import("@forwardimpact/libutil/runtime").Runtime} opts.runtime -
   *   Injected ambient collaborators (`fs`, `subprocess`, `clock`, `proc`),
   *   threaded into the installers, workdir manager, invariants, and judge.
   * @param {Function} [opts.runInvariants] - Test seam: replaces `runInvariants`.
   *   Same contract as `runInvariants(task, ctx, runtime)`. Internal testing only.
   * @param {Function} [opts.runHiddenTests] - Test seam: replaces
   *   `runHiddenTests`. Same contract as `runHiddenTests(task, ctx, runtime)`.
   *   Internal testing only.
   * @param {Function} [opts.runJudge] - Test seam: replaces `runJudge`. Same
   *   contract as `runJudge(task, workdir, gradeResult, deps)` where
   *   `gradeResult` is the normalized grade plus the merged, source-stamped
   *   check `rows` (deps carries `runtime`). Internal testing only.
   * @param {Function} [opts.installApm] - Test seam: replaces `installApm`.
   *   Same contract as `installApm(family, outputDir, runtime)`. Lets tests
   *   inject a fake subprocess (or skip the install entirely) so the suite
   *   never shells out to a real `apm` binary. Internal testing only.
   * @param {Function} [opts.installNpm] - Test seam: replaces `installNpm`.
   *   Same contract as `installNpm(family, stagingDir, runtime)`. Internal
   *   testing only.
   */
  constructor({
    family,
    runs,
    output,
    agentModel,
    supervisorModel,
    judgeModel,
    profiles,
    query,
    allowedTools,
    maxTurns,
    concurrency,
    watchdogMs,
    shard,
    task,
    skillsFrom,
    termGraceMs,
    runtime,
    // Test seams — default to the real implementations.
    runAgent,
    runInvariants: runInvariantsHook,
    runHiddenTests: runHiddenTestsHook,
    runJudge: runJudgeHook,
    installApm: installApmHook,
    installNpm: installNpmHook,
  }) {
    validateRunnerArgs({ family, runs, output, agentModel, query, runtime });
    this.runtime = runtime;
    this.familyInput = family;
    this.runs = runs;
    this.output = output;
    this.agentModel = agentModel;
    this.supervisorModel = supervisorModel;
    this.judgeModel = judgeModel;
    this.allowedTools = allowedTools ?? BASE_TOOLS;
    this.profiles = {
      agent: profiles?.agent ?? null,
      judge: profiles?.judge ?? null,
    };
    this.query = query;
    this.maxTurns = maxTurns;
    this.concurrency = concurrency ?? 1;
    this.watchdogMs = watchdogMs ?? AGENT_WATCHDOG_MS;
    this.shard = shard ?? null;
    this.taskFilter = task ?? null;
    this.skillsFrom = skillsFrom ?? null;
    this.termGraceMs = termGraceMs;
    this._runAgentHook = runAgent ?? null;
    this._runInvariantsHook = runInvariantsHook ?? runInvariants;
    this._runHiddenTestsHook = runHiddenTestsHook ?? runHiddenTests;
    this._runJudgeHook = runJudgeHook ?? runJudge;
    this._installApmHook = installApmHook ?? defaultInstallApm;
    this._installNpmHook = installNpmHook ?? defaultInstallNpm;
  }

  /**
   * Yield one ResultRecord per (task, runIndex).
   * @returns {AsyncGenerator<object>}
   */
  async *run() {
    const runtime = this.runtime;
    const family =
      typeof this.familyInput === "string"
        ? await loadTaskFamily(this.familyInput, runtime)
        : this.familyInput;

    await runtime.fs.mkdir(this.output, { recursive: true });
    const { stagingDir, skillSetHash, judgeProfilesDir } =
      await this._installApmHook(family, this.output, runtime, {
        skillsFrom: this.skillsFrom,
      });
    await this._installNpmHook(family, stagingDir, runtime);

    let tasks = family.tasks();
    if (this.taskFilter) {
      const matched = tasks.filter((t) => t.id === this.taskFilter);
      if (matched.length === 0) {
        const available = tasks.map((t) => t.id).join(", ");
        throw new Error(
          `no task '${this.taskFilter}' in family; available: ${available}`,
        );
      }
      tasks = matched;
    }
    if (this.profiles.judge) {
      await assertJudgeProfileStaged(
        family,
        judgeProfilesDir,
        this.profiles.judge,
        runtime,
      );
    }

    const wm = createWorkdirManager({
      stagingDir,
      runOutputDir: this.output,
      termGraceMs: this.termGraceMs,
      familyRootPath: family.rootPath,
      runtime,
    });

    const allCells = enumerateCells(tasks, this.runs);
    // Sharding selects a deterministic subset of the grid; an unsharded run is
    // the identity 1/1. A high-index shard may select zero cells — a valid run
    // whose results.jsonl ends up empty.
    const cells = this.shard
      ? selectShard(allCells, this.shard.index, this.shard.total)
      : allCells;
    const scheduler = new CellScheduler({
      concurrency: this.concurrency,
      runCell: (cell) =>
        this.#runOne(
          family,
          wm,
          cell.task,
          cell.runIndex,
          skillSetHash,
          judgeProfilesDir,
        ),
    });

    const resultsPath = join(this.output, "results.jsonl");
    const resultsStream = runtime.fs.createWriteStream(resultsPath, {
      flags: "a",
    });
    // Single-writer drain: the scheduler runs up to `concurrency` cells at
    // once and pushes each settled record here in completion order. This loop
    // is the sole writer of `results.jsonl` — workers never touch the stream —
    // and the per-completion append is the crash-safety mechanism.
    try {
      for await (const record of scheduler.run(cells)) {
        await writeRecord(resultsStream, record);
        yield record;
      }
    } finally {
      await new Promise((r) => resultsStream.end(r));
    }
  }

  async #runOne(family, wm, task, runIndex, skillSetHash, judgeProfilesDir) {
    const t0 = this.runtime.clock.now();
    let workdir;
    try {
      workdir = await wm.start(task, runIndex);
      return await this.#executeCell({
        family,
        workdir,
        task,
        runIndex,
        skillSetHash,
        judgeProfilesDir,
        t0,
      });
    } catch (e) {
      // `wm.start()` (port acquire + workdir/env seeding) is the one throw site
      // not caught inside `#executeCell`. Turn it into the runner's own fallback
      // record so `#runOne` never rejects — the scheduler's one-record-per-cell
      // contract depends on that. The fallback is schema-skipped by `report`,
      // the same as any other runner-side schema failure.
      return {
        taskId: task.id,
        runIndex,
        verdict: "fail",
        schemaError: `cell setup failed: ${e.message ?? String(e)}`,
      };
    } finally {
      if (workdir) await wm.teardown(workdir).catch(() => {});
    }
  }

  /**
   * Run one cell's lifecycle against an already-started workdir: preflight
   * gate → supervised agent → invariants → judge → assembled record. Extracted
   * from `#runOne` so the start/teardown/error wrapper stays under the
   * complexity ceiling.
   */
  async #executeCell({
    family,
    workdir,
    task,
    runIndex,
    skillSetHash,
    judgeProfilesDir,
    t0,
  }) {
    if (workdir.preflightError) {
      const record = this.#buildPreflightFailureRecord({
        task,
        runIndex,
        workdir,
        skillSetHash,
        familyRevision: family.familyRevision,
        durationMs: this.runtime.clock.now() - t0,
      });
      return this.#validateOrFallback(record, resultsRecordKey(task, runIndex));
    }
    {
      const agentRun = await this.#runAgentSafe(task, workdir);
      const { costUsd, costBreakdown, turns, submission, agentError } =
        agentRun;
      const graded = await this.#gradeCell(family, task, workdir);
      const { invariants, hiddenRows, engineError, rows, grade } = graded;
      const { judgeVerdict, judgeCost } = await this.#judgeCell({
        task,
        workdir,
        gradeResult: { ...grade, rows },
        skillSetHash,
        judgeProfilesDir,
      });
      const judgePass =
        judgeVerdict === null || judgeVerdict.verdict === "pass";
      const verdict = grade.verdict === "pass" && judgePass ? "pass" : "fail";
      // Gates protect the score: an unhealthy grader, a failing gate row, or
      // a failing judge zeroes the effective score. Full marks does not — a
      // fractional score with verdict fail is the point.
      const scoreValid = graded.healthy && grade.gatesPass && judgePass;
      const tracePaths = await this.#traceRecordPaths(workdir);
      const record = {
        taskId: task.id,
        runIndex,
        verdict,
        invariants,
        grade,
        ...(task.tests && {
          hiddenTests: {
            details: hiddenRows,
            ...(engineError && { error: engineError.message }),
          },
        }),
        ...(grade.score !== undefined && {
          score: scoreValid ? grade.score : 0,
        }),
        submission,
        ...(judgeVerdict && { judgeVerdict }),
        costUsd: costUsd + judgeCost,
        costBreakdown: { ...costBreakdown, judge: judgeCost },
        turns,
        ...tracePaths,
        profiles: {
          agent: this.profiles.agent,
          supervisor: null,
          judge: this.profiles.judge,
        },
        model: {
          agent: this.agentModel,
          supervisor: this.supervisorModel,
          judge: this.judgeModel,
        },
        skillSetHash,
        familyRevision: family.familyRevision,
        durationMs: this.runtime.clock.now() - t0,
        ...(agentError && { agentError }),
      };
      return this.#validateOrFallback(record, resultsRecordKey(task, runIndex));
    }
  }

  /**
   * Run the judge (when the task ships a template) over the grade result.
   * The record's judgeVerdict carries only the verdict + summary; the
   * judge's cost is folded into costUsd / costBreakdown instead.
   */
  async #judgeCell({
    task,
    workdir,
    gradeResult,
    skillSetHash,
    judgeProfilesDir,
  }) {
    if (!task.paths.judge) return { judgeVerdict: null, judgeCost: 0 };
    const judgeContext = await this.#buildJudgeContext(
      task,
      workdir,
      skillSetHash,
    );
    const judgeResult = await this._runJudgeHook(
      task,
      workdir,
      gradeResult,
      {
        query: this.query,
        model: this.judgeModel,
        judgeProfile: this.profiles.judge ?? undefined,
        profilesDir: judgeProfilesDir,
        runtime: this.runtime,
      },
      judgeContext,
    );
    return {
      judgeVerdict: {
        verdict: judgeResult.verdict,
        summary: judgeResult.summary,
      },
      judgeCost: judgeResult.costUsd ?? 0,
    };
  }

  /**
   * Run both check-row producers against the post-run CWD and grade the
   * merged rows via the shared derivation. Restoration happens inside the
   * engine, so the judge (which runs after) sees the workdir exactly as the
   * agent left it.
   */
  #gradeCell(family, task, workdir) {
    const ctx = {
      cwd: workdir.cwd,
      port: workdir.port,
      runDir: workdir.runDir,
      familyDir: family.rootPath,
    };
    return runProducersAndGrade(task, ctx, this.runtime, {
      runInvariants: this._runInvariantsHook,
      runHiddenTests: this._runHiddenTestsHook,
    });
  }

  /**
   * Dispatch to either the injected hook or the default `#runAgent`, then run
   * the shared pipeline once: split the preserved raw trace into lanes and
   * derive cost/turns/submission from the same file. Either session path can
   * throw; catch here so a thrown error becomes an `agentError` on the record
   * (spec criterion 1: records on agent failure) rather than aborting the
   * whole iterator — the pipeline still runs, so failed cells keep coherent
   * (possibly empty) lanes and zeroed totals.
   */
  async #runAgentSafe(task, workdir) {
    let agentError = null;
    try {
      const r = this._runAgentHook
        ? await this._runAgentHook(task, workdir, this)
        : await this.#runAgent(task, workdir);
      agentError = r?.agentError ?? null;
    } catch (e) {
      agentError = { message: e.message ?? String(e), aborted: false };
    }
    await splitTrace(this.runtime, workdir.rawTracePath, {
      caseId: workdir.caseId,
      outputDir: workdir.runDir,
    });
    const summary = await summarizeRawTrace(this.runtime, workdir.rawTracePath);
    return { ...summary, agentError };
  }

  /**
   * Run the agent-under-test under a Supervisor. The supervisor streams the
   * combined tagged NDJSON envelope trace to `workdir.rawTracePath`, which is
   * preserved for the life of the run output; `#runAgentSafe` splits it into
   * the convention-named lanes and summarizes it afterwards.
   */
  async #runAgent(task, workdir) {
    const fs = this.runtime.fs;
    const combinedStream = fs.createWriteStream(workdir.rawTracePath);
    const supervisorInstructions = task.paths.supervisor
      ? await fs.readFile(task.paths.supervisor, "utf8").catch(() => null)
      : null;
    const supervisor = createSupervisor({
      supervisorCwd: workdir.cwd,
      agentCwd: workdir.cwd,
      query: this.query,
      output: combinedStream,
      agentModel: this.agentModel,
      supervisorModel: this.supervisorModel,
      maxTurns: this.maxTurns ?? 50,
      allowedTools: this.allowedTools,
      ...(this.profiles.agent && { agentProfile: this.profiles.agent }),
      ...(supervisorInstructions && { taskAmend: supervisorInstructions }),
      redactor: createRedactor({
        allowlist: [...DEFAULT_ENV_ALLOWLIST, ...(workdir.envNames ?? [])],
        runtime: this.runtime,
      }),
      runtime: this.runtime,
    });
    const instructions = await fs.readFile(task.paths.instructions, "utf8");
    let agentError = null;
    // Watchdog: a supervised session can hang without settling (e.g. the agent
    // SDK subprocess exits without a terminal message), which would empty the
    // event loop and exit the process mid-run with zero records. Race the run
    // against a bounded timer so a stall becomes an `agentError` record instead
    // of a silent exit; the timer also keeps the loop alive until it fires.
    let watchdog;
    try {
      const result = await Promise.race([
        supervisor.run(instructions),
        new Promise((_, reject) => {
          watchdog = this.runtime.clock.setTimeout(
            () =>
              reject(
                new Error(
                  `agent run produced no result within ${this.watchdogMs}ms (possible stall)`,
                ),
              ),
            this.watchdogMs,
          );
        }),
      ]);
      if (!result.success && !result.concluded) {
        agentError = { message: "supervisor did not succeed", aborted: false };
      }
    } catch (e) {
      agentError = { message: e.message ?? String(e), aborted: false };
    } finally {
      this.runtime.clock.clearTimeout(watchdog);
      await new Promise((r) => combinedStream.end(r));
    }
    return { agentError };
  }

  /**
   * Run-output-relative trace-path record fields, each present only when its
   * file exists: raw and agent/supervisor lanes are materialized at workdir
   * allocation (present on every executed cell); the judge lane exists only
   * on judged cells. Relative paths stay valid inside a downloaded artifact.
   */
  async #traceRecordPaths(workdir) {
    const fields = {
      rawTracePath: workdir.rawTracePath,
      agentTracePath: workdir.agentTracePath,
      supervisorTracePath: workdir.supervisorTracePath,
      judgeTracePath: workdir.judgeTracePath,
    };
    const out = {};
    for (const [field, absPath] of Object.entries(fields)) {
      const exists = await this.runtime.fs
        .access(absPath)
        .then(() => true)
        .catch(() => false);
      if (exists) out[field] = relative(this.output, absPath);
    }
    return out;
  }

  async #buildJudgeContext(task, workdir, skillSetHash) {
    const fs = this.runtime.fs;
    const agentInstructions = await fs.readFile(
      task.paths.instructions,
      "utf8",
    );
    let agentProfile = "";
    if (this.profiles.agent) {
      const profilePath = resolvePath(
        workdir.cwd,
        ".claude/agents",
        `${this.profiles.agent}.md`,
      );
      agentProfile = await fs.readFile(profilePath, "utf8").catch(() => "");
    }
    return { agentInstructions, agentProfile, skillSetHash };
  }

  #buildPreflightFailureRecord({
    task,
    runIndex,
    workdir,
    skillSetHash,
    familyRevision,
    durationMs,
  }) {
    return {
      taskId: task.id,
      runIndex,
      verdict: "fail",
      costUsd: 0,
      turns: 0,
      preflightError: workdir.preflightError,
      profiles: {
        agent: this.profiles.agent,
        supervisor: null,
        judge: this.profiles.judge,
      },
      model: {
        agent: this.agentModel,
        supervisor: this.supervisorModel,
        judge: this.judgeModel,
      },
      skillSetHash,
      familyRevision,
      durationMs,
      // No trace-path fields: even though the materialized stubs exist on
      // disk, a preflight-failure record references only traces a session
      // produced (design decision 7).
    };
  }

  #validateOrFallback(record, key) {
    try {
      validateResultRecord(record);
      return record;
    } catch (e) {
      // The runner constructed the record — a schema failure is a real bug,
      // not bad family input. Emit a noisy fallback so the iterator stays
      // consumable and the agent budget isn't silently dropped.
      return {
        taskId: record.taskId ?? key.taskId,
        runIndex: record.runIndex ?? key.runIndex,
        verdict: "fail",
        schemaError: e.message ?? String(e),
      };
    }
  }
}

/**
 * Flatten the grid into a stable ordered cell list, task-major /
 * runIndex-minor. Load-bearing ordering: Part 02's round-robin shard balance
 * depends on a task's runIndexes being adjacent in this list. Single source of
 * the cell list for both the scheduler and the shard selector.
 * @param {import("./task-family.js").Task[]} tasks
 * @param {number} runs
 * @returns {{task: import("./task-family.js").Task, runIndex: number}[]}
 */
export function enumerateCells(tasks, runs) {
  const cells = [];
  for (const task of tasks)
    for (let runIndex = 0; runIndex < runs; runIndex++)
      cells.push({ task, runIndex });
  return cells;
}

/**
 * Round-robin partition of the enumerated cells: the cell at position `p` runs
 * iff `p % total === i - 1`. `i` is 1-based (Playwright-style). The union over
 * `i ∈ 1..total` is the exact grid, each cell once; when `total > cells.length`
 * the high-index shards select **zero** cells — a valid run. Because
 * `enumerateCells` is task-major, a task's run indexes are adjacent, so
 * round-robin spreads them across shards rather than handing one shard a slow
 * task's whole run block.
 * @param {{task: object, runIndex: number}[]} cells
 * @param {number} i - 1-based shard index.
 * @param {number} total - Shard count.
 * @returns {{task: object, runIndex: number}[]}
 */
export function selectShard(cells, i, total) {
  return cells.filter((_, p) => p % total === i - 1);
}

/**
 * Validate the required BenchmarkRunner constructor arguments. Extracted from
 * the constructor to keep its cognitive complexity under the lint ceiling.
 */
function validateRunnerArgs({
  family,
  runs,
  output,
  agentModel,
  query,
  runtime,
}) {
  if (!family) throw new Error("family is required");
  if (!Number.isInteger(runs) || runs < 1)
    throw new Error("runs must be an integer ≥ 1");
  if (!output) throw new Error("output is required");
  if (!agentModel) throw new Error("agentModel is required");
  if (!query) throw new Error("query is required");
  if (!runtime) throw new Error("runtime is required");
}

function resultsRecordKey(task, runIndex) {
  return { taskId: task.id, runIndex };
}

async function writeRecord(stream, record) {
  const line = JSON.stringify(record) + "\n";
  await new Promise((res, rej) => {
    stream.write(line, (err) => (err ? rej(err) : res()));
  });
}

/**
 * Factory function — wires real dependencies.
 * @param {ConstructorParameters<typeof BenchmarkRunner>[0]} opts
 * @returns {BenchmarkRunner}
 */
export function createBenchmarkRunner(opts) {
  return new BenchmarkRunner(opts);
}

// Internal exports used by tests.
export const __BASE_TOOLS = BASE_TOOLS;
