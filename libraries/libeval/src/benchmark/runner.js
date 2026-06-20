/**
 * BenchmarkRunner — sole orchestrator for a task-family benchmark run.
 *
 * Phases per (task, runIndex):
 *   1. WorkdirManager.start → seed CWD + run pre-flight probe
 *   2. Supervisor session (agent + supervisor) → produce traces + submission
 *   3. Invariants.runInvariants → exit-code-driven verdict via fd-3 NDJSON
 *   4. Judge.runJudge → Conclude-driven verdict mapped to pass/fail
 *   5. WorkdirManager.teardown → process-group cleanup
 *
 * Results stream as an async iterable AND are appended to
 * `<output>/results.jsonl` for durability. The two paths are different
 * consumers of the same record — the iterator drives CLI stdout mirroring,
 * the JSONL append is the system of record.
 */

import { createInterface } from "node:readline";
import { join, resolve as resolvePath } from "node:path";

import { DEFAULT_ENV_ALLOWLIST, createRedactor } from "../redaction.js";
import { sumTraceCost } from "../cost.js";
import { createSupervisor } from "../supervisor.js";
import { installApm as defaultInstallApm } from "./apm-installer.js";
import { installNpm as defaultInstallNpm } from "./npm-installer.js";
import { runJudge } from "./judge.js";
import { validateResultRecord } from "./result.js";
import { runInvariants } from "./invariants.js";
import { assertJudgeProfileStaged, loadTaskFamily } from "./task-family.js";
import { createWorkdirManager } from "./workdir.js";

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

// Idle ceiling for a supervised agent run: if no trace line is written for this
// long the run is treated as a stall and recorded as an agentError, so the
// benchmark never hangs the event loop into a silent exit. Keyed on activity,
// not total runtime, so a healthy streaming run is never cut while a stalled one
// ends within a run-budget that lets the whole task matrix finish in time. Three
// minutes clears observed sub-minute inter-turn gaps with margin.
const AGENT_IDLE_MS = 3 * 60 * 1000;

/**
 * Race `work` against an idle watchdog. The watchdog rejects when no trace
 * activity has been seen for `idleMs` — `activity.at` is a timestamp ref the
 * caller bumps on every trace write. Unlike a fixed total-runtime cap, a
 * healthy run that keeps streaming output is never cut; only a run that goes
 * (or starts) silent for `idleMs` is aborted as a stall. Exported for test.
 * @param {Promise<{success: boolean}>} work - The supervised run promise.
 * @param {{at: number}} activity - Last-activity timestamp ref (clock.now()).
 * @param {{now: () => number, setTimeout: Function, clearTimeout: Function}} clock
 * @param {number} idleMs - Idle threshold before the run is treated as stalled.
 * @returns {Promise<{success: boolean}>}
 */
export async function raceIdleWatchdog(work, activity, clock, idleMs) {
  let timer;
  try {
    return await Promise.race([
      work,
      new Promise((_, reject) => {
        const tick = () => {
          const idleFor = clock.now() - activity.at;
          if (idleFor >= idleMs) {
            reject(
              new Error(
                `agent run produced no trace output for ${idleMs}ms (possible stall)`,
              ),
            );
            return;
          }
          timer = clock.setTimeout(tick, idleMs - idleFor);
        };
        timer = clock.setTimeout(tick, idleMs);
      }),
    ]);
  } finally {
    clock.clearTimeout(timer);
  }
}

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
   * @param {number} [opts.termGraceMs] - SIGTERM→SIGKILL grace (ms) for the per-task process group.
   * @param {Function} [opts.runAgent] - Test seam: replaces the agent-under-test
   *   session. Must return `{costUsd, turns, submission, agentError?}` and
   *   write a valid NDJSON trace to `workdir.agentTracePath`. Default uses
   *   `createAgentRunner` with the harness `BASE_TOOLS` allowlist. Internal
   *   testing only — not part of the public API.
   * @param {import("@forwardimpact/libutil/runtime").Runtime} opts.runtime -
   *   Injected ambient collaborators (`fs`, `subprocess`, `clock`, `proc`),
   *   threaded into the installers, workdir manager, invariants, and judge.
   * @param {Function} [opts.runInvariants] - Test seam: replaces `runInvariants`.
   *   Same contract as `runInvariants(task, ctx, runtime)`. Internal testing only.
   * @param {Function} [opts.runJudge] - Test seam: replaces `runJudge`. Same
   *   contract as `runJudge(task, workdir, invariants, deps)` (deps carries
   *   `runtime`). Internal testing only.
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
    task,
    skillsFrom,
    termGraceMs,
    runtime,
    // Test seams — default to the real implementations.
    runAgent,
    runInvariants: runInvariantsHook,
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
    this.taskFilter = task ?? null;
    this.skillsFrom = skillsFrom ?? null;
    this.termGraceMs = termGraceMs;
    this._runAgentHook = runAgent ?? null;
    this._runInvariantsHook = runInvariantsHook ?? runInvariants;
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

    const resultsPath = join(this.output, "results.jsonl");
    const resultsStream = runtime.fs.createWriteStream(resultsPath, {
      flags: "a",
    });
    try {
      for (const task of tasks) {
        for (let runIndex = 0; runIndex < this.runs; runIndex++) {
          const record = await this.#runOne(
            family,
            wm,
            task,
            runIndex,
            skillSetHash,
            judgeProfilesDir,
          );
          await writeRecord(resultsStream, record);
          yield record;
        }
      }
    } finally {
      await new Promise((r) => resultsStream.end(r));
    }
  }

  async #runOne(family, wm, task, runIndex, skillSetHash, judgeProfilesDir) {
    const t0 = this.runtime.clock.now();
    const workdir = await wm.start(task, runIndex);
    try {
      if (workdir.preflightError) {
        const record = this.#buildPreflightFailureRecord({
          task,
          runIndex,
          workdir,
          skillSetHash,
          familyRevision: family.familyRevision,
          durationMs: this.runtime.clock.now() - t0,
        });
        return this.#validateOrFallback(
          record,
          resultsRecordKey(task, runIndex),
        );
      }
      const agentRun = await this.#runAgentSafe(task, workdir);
      const { costUsd, turns, submission, agentError } = agentRun;
      const breakdown = agentRun.costBreakdown ?? { agent: 0, supervisor: 0 };
      const invariants = await this._runInvariantsHook(
        task,
        {
          cwd: workdir.cwd,
          port: workdir.port,
          runDir: workdir.runDir,
          familyDir: family.rootPath,
        },
        this.runtime,
      );
      let judgeVerdict = null;
      let judgeCost = 0;
      if (task.paths.judge) {
        const judgeContext = await this.#buildJudgeContext(
          task,
          workdir,
          skillSetHash,
        );
        const judgeResult = await this._runJudgeHook(
          task,
          workdir,
          invariants,
          {
            query: this.query,
            model: this.judgeModel,
            judgeProfile: this.profiles.judge ?? undefined,
            profilesDir: judgeProfilesDir,
            runtime: this.runtime,
          },
          judgeContext,
        );
        judgeCost = judgeResult.costUsd ?? 0;
        // The record's judgeVerdict carries only the verdict + summary; the
        // judge's cost is folded into costUsd / costBreakdown instead.
        judgeVerdict = {
          verdict: judgeResult.verdict,
          summary: judgeResult.summary,
        };
      }
      const verdict =
        invariants.verdict === "pass" &&
        (judgeVerdict === null || judgeVerdict.verdict === "pass")
          ? "pass"
          : "fail";
      const record = {
        taskId: task.id,
        runIndex,
        verdict,
        invariants,
        submission,
        ...(judgeVerdict && { judgeVerdict }),
        costUsd: costUsd + judgeCost,
        costBreakdown: {
          agent: breakdown.agent ?? 0,
          supervisor: breakdown.supervisor ?? 0,
          judge: judgeCost,
        },
        turns,
        agentTracePath: workdir.agentTracePath,
        supervisorTracePath: workdir.supervisorTracePath,
        judgeTracePath: workdir.judgeTracePath,
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
    } finally {
      await wm.teardown(workdir).catch(() => {});
    }
  }

  /**
   * Dispatch to either the injected hook or the default `#runAgent`. Either
   * path can throw; catch here so a thrown error becomes an `agentError` on
   * the record (spec criterion 1: records on agent failure) rather than
   * aborting the whole iterator.
   */
  async #runAgentSafe(task, workdir) {
    try {
      if (this._runAgentHook) {
        const r = await this._runAgentHook(task, workdir, this);
        return { agentError: null, ...r };
      }
      return await this.#runAgent(task, workdir);
    } catch (e) {
      return {
        costUsd: 0,
        costBreakdown: { agent: 0, supervisor: 0 },
        turns: 0,
        submission: "",
        agentError: { message: e.message ?? String(e), aborted: false },
      };
    }
  }

  /**
   * Run the agent-under-test under a Supervisor. The supervisor writes
   * a combined tagged NDJSON trace; after the session we split it into
   * agent.ndjson and supervisor.ndjson and extract cost/turns/submission.
   */
  async #runAgent(task, workdir) {
    const fs = this.runtime.fs;
    const combinedPath = join(workdir.runDir, ".combined.ndjson");
    const combinedStream = fs.createWriteStream(combinedPath);
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
    // Watchdog: a supervised session settles only when the lead calls
    // `Conclude`. An LLM lead may finish the work yet never conclude (leaving
    // `run()` pending forever), or a misconfigured run may produce nothing at
    // all (e.g. an unusable API key the SDK retries indefinitely). Both show up
    // as a trace that goes — or starts — silent. Race the run against an *idle*
    // timer keyed on trace activity, not a fixed total cap: a healthy run that
    // streams output then settles resolves normally, while a stalled one is cut
    // shortly after it stops producing — so one bad run can't burn the whole
    // job budget, and a dead run fails fast instead of hanging for 20 minutes.
    const activity = { at: this.runtime.clock.now() };
    const origWrite = combinedStream.write.bind(combinedStream);
    combinedStream.write = (...args) => {
      activity.at = this.runtime.clock.now();
      return origWrite(...args);
    };
    try {
      const result = await raceIdleWatchdog(
        supervisor.run(instructions),
        activity,
        this.runtime.clock,
        AGENT_IDLE_MS,
      );
      if (!result.success && !result.concluded) {
        agentError = { message: "supervisor did not succeed", aborted: false };
      }
    } catch (e) {
      agentError = { message: e.message ?? String(e), aborted: false };
    } finally {
      await new Promise((r) => combinedStream.end(r));
    }
    const summary = await splitAndSummarize(
      this.runtime,
      combinedPath,
      workdir.agentTracePath,
      workdir.supervisorTracePath,
    );
    // Cost is summed across every participant's result events from the one
    // combined trace, attributed per source. Read before unlinking.
    const combined = await fs.readFile(combinedPath, "utf8");
    const { totalCostUsd, bySource } = sumTraceCost(combined.split("\n"));
    await fs.unlink(combinedPath).catch(() => {});
    return {
      ...summary,
      costUsd: totalCostUsd,
      costBreakdown: {
        agent: bySource.agent ?? 0,
        supervisor: bySource.supervisor ?? 0,
      },
      agentError,
    };
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
      agentTracePath: workdir.agentTracePath,
      supervisorTracePath: workdir.supervisorTracePath,
      judgeTracePath: workdir.judgeTracePath,
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
 * Split the combined supervisor trace into agent and supervisor files and
 * extract turn count and submission in a single pass. Agent-source events go
 * to `agentPath`; supervisor and orchestrator events go to `supervisorPath`.
 *
 * Cost is deliberately not summed here — the caller derives it from the same
 * combined trace via `sumTraceCost`, so there is one cost path across the
 * benchmark, callback, and `fit-trace cost` consumers.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: stream-splitting state machine
async function splitAndSummarize(
  runtime,
  combinedPath,
  agentPath,
  supervisorPath,
) {
  const fs = runtime.fs;
  const agentStream = fs.createWriteStream(agentPath);
  const supStream = fs.createWriteStream(supervisorPath);
  const rl = createInterface({
    input: fs.createReadStream(combinedPath),
    crlfDelay: Infinity,
  });
  let turns = 0;
  let submission = "";
  for await (const line of rl) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const target = event.source === "agent" ? agentStream : supStream;
    target.write(line + "\n");
    const inner = event.event;
    if (!inner) continue;
    if (event.source === "agent" && inner.type === "assistant") {
      const text = extractText(inner);
      if (text) submission = text;
    }
    if (event.source === "orchestrator" && inner.type === "summary") {
      turns = inner.turns ?? 0;
    }
  }
  await Promise.all([
    new Promise((r) => agentStream.end(r)),
    new Promise((r) => supStream.end(r)),
  ]);
  return { turns, submission };
}

function extractText(inner) {
  const content = inner.message?.content ?? inner.content;
  if (!Array.isArray(content)) return null;
  for (let i = content.length - 1; i >= 0; i--) {
    if (content[i].type === "text" && content[i].text) return content[i].text;
  }
  return null;
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
