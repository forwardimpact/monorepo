/**
 * BenchmarkRunner — sole orchestrator for a task-family benchmark run.
 *
 * Phases per (task, runIndex):
 *   1. WorkdirManager.start → seed CWD + run pre-flight probe
 *   2. AgentRunner (bare; design Decision 14) → produce trace + submission
 *   3. Scorer.runScoring → exit-code-driven verdict via fd-3 NDJSON
 *   4. Judge.runJudge → Conclude-driven verdict mapped to pass/fail
 *   5. WorkdirManager.teardown → process-group cleanup
 *
 * Results stream as an async iterable AND are appended to
 * `<output>/results.jsonl` for durability. The two paths are different
 * consumers of the same record — the iterator drives CLI stdout mirroring,
 * the JSONL append is the system of record.
 */

import { createReadStream, createWriteStream } from "node:fs";
import { access, constants, mkdir, readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join, resolve as resolvePath } from "node:path";

import { createAgentRunner } from "../agent-runner.js";
import { composeProfilePrompt } from "../profile-prompt.js";
import { createRedactor } from "../redaction.js";
import { AGENT_SYSTEM_PROMPT } from "../supervisor.js";
import { createTraceCollector } from "../trace-collector.js";
import { installApm } from "./apm-installer.js";
import { runJudge } from "./judge.js";
import { validateResultRecord } from "./result.js";
import { runScoring } from "./scorer.js";
import { assertJudgeProfileStaged, loadTaskFamily } from "./task-family.js";
import { createWorkdirManager } from "./workdir.js";

const BASE_TOOLS = ["Bash", "Read", "Glob", "Grep", "Write", "Edit"];

/** Sole orchestrator for a task-family benchmark run. */
export class BenchmarkRunner {
  /**
   * @param {object} opts
   * @param {import("./task-family.js").TaskFamily | string} opts.family
   * @param {number} opts.runs - Runs per task (≥ 1).
   * @param {string} opts.output - Run-output directory.
   * @param {string} opts.model
   * @param {{agent?: string, judge?: string}} [opts.profiles]
   * @param {Function} opts.query - SDK query (injected for testability).
   * @param {number} [opts.maxTurns] - Agent-under-test turn budget.
   * @param {number} [opts.termGraceMs] - SIGTERM→SIGKILL grace (ms) for the per-task process group.
   * @param {Function} [opts.runAgent] - Test seam: replaces the agent-under-test
   *   session. Must return `{costUsd, turns, submission, agentError?}` and
   *   write a valid NDJSON trace to `workdir.agentTracePath`. Default uses
   *   `createAgentRunner` with the harness `BASE_TOOLS` allowlist. Internal
   *   testing only — not part of the public API.
   * @param {Function} [opts.runScoring] - Test seam: replaces `runScoring`.
   *   Same contract as `runScoring(task, ctx)`. Internal testing only.
   * @param {Function} [opts.runJudge] - Test seam: replaces `runJudge`. Same
   *   contract as `runJudge(task, workdir, scoring, deps)`. Internal testing
   *   only.
   */
  constructor({
    family,
    runs,
    output,
    model,
    profiles,
    query,
    maxTurns,
    termGraceMs,
    // Test seams — default to the real implementations.
    runAgent,
    runScoring: runScoringHook,
    runJudge: runJudgeHook,
  }) {
    if (!family) throw new Error("family is required");
    if (!Number.isInteger(runs) || runs < 1)
      throw new Error("runs must be an integer ≥ 1");
    if (!output) throw new Error("output is required");
    if (!model) throw new Error("model is required");
    if (!query) throw new Error("query is required");
    this.familyInput = family;
    this.runs = runs;
    this.output = output;
    this.model = model;
    this.profiles = {
      agent: profiles?.agent ?? null,
      judge: profiles?.judge ?? null,
    };
    this.query = query;
    this.maxTurns = maxTurns;
    this.termGraceMs = termGraceMs;
    this._runAgentHook = runAgent ?? null;
    this._runScoringHook = runScoringHook ?? runScoring;
    this._runJudgeHook = runJudgeHook ?? runJudge;
  }

  /**
   * Yield one ResultRecord per (task, runIndex).
   * @returns {AsyncGenerator<object>}
   */
  async *run() {
    const family =
      typeof this.familyInput === "string"
        ? await loadTaskFamily(this.familyInput)
        : this.familyInput;

    await mkdir(this.output, { recursive: true });
    const { stagingDir, skillSetHash } = await installApm(family, this.output);

    const tasks = family.tasks();
    for (const task of tasks) {
      await assertPreflightExecutable(task);
    }
    if (this.profiles.judge) {
      await assertJudgeProfileStaged(family, stagingDir, this.profiles.judge);
    }

    const wm = createWorkdirManager({
      stagingDir,
      runOutputDir: this.output,
      termGraceMs: this.termGraceMs,
    });

    const resultsPath = join(this.output, "results.jsonl");
    const resultsStream = createWriteStream(resultsPath, { flags: "a" });
    try {
      for (const task of tasks) {
        for (let runIndex = 0; runIndex < this.runs; runIndex++) {
          const record = await this.#runOne(
            family,
            wm,
            task,
            runIndex,
            skillSetHash,
          );
          await writeRecord(resultsStream, record);
          yield record;
        }
      }
    } finally {
      await new Promise((r) => resultsStream.end(r));
    }
  }

  async #runOne(family, wm, task, runIndex, skillSetHash) {
    const t0 = Date.now();
    const workdir = await wm.start(task, runIndex);
    try {
      if (workdir.preflightError) {
        const record = this.#buildPreflightFailureRecord({
          task,
          runIndex,
          workdir,
          skillSetHash,
          familyRevision: family.familyRevision,
          durationMs: Date.now() - t0,
        });
        return this.#validateOrFallback(
          record,
          resultsRecordKey(task, runIndex),
        );
      }
      const { costUsd, turns, submission, agentError } =
        await this.#runAgentSafe(task, workdir);
      const scoring = await this._runScoringHook(task, {
        cwd: workdir.cwd,
        port: workdir.port,
        runDir: workdir.runDir,
      });
      const judgeVerdict = await this._runJudgeHook(task, workdir, scoring, {
        query: this.query,
        model: this.model,
        judgeProfile: this.profiles.judge ?? undefined,
      });
      const record = {
        taskId: task.id,
        runIndex,
        verdict:
          scoring.verdict === "pass" && judgeVerdict.verdict === "pass"
            ? "pass"
            : "fail",
        scoring,
        submission,
        judgeVerdict,
        costUsd,
        turns,
        agentTracePath: workdir.agentTracePath,
        judgeTracePath: workdir.judgeTracePath,
        profiles: {
          agent: this.profiles.agent,
          supervisor: null,
          judge: this.profiles.judge,
        },
        model: this.model,
        skillSetHash,
        familyRevision: family.familyRevision,
        durationMs: Date.now() - t0,
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
        turns: 0,
        submission: "",
        agentError: { message: e.message ?? String(e), aborted: false },
      };
    }
  }

  /**
   * Run the agent-under-test as a bare AgentRunner (design Decision 14).
   * Recover cost/turns/submission from the trace by replaying it into a
   * fresh TraceCollector — the bare runner writes a single NDJSON stream
   * with one terminal `result` event.
   *
   * Inspects both thrown errors AND the resolved `{success, aborted, error}`
   * shape returned by `AgentRunner.run()` (agent-runner.js:69, 166–194):
   * the SDK iterator catches its own errors and resolves with `success:
   * false`, so a try/catch alone would silently treat a failed session as
   * a successful one (plan Step 8.5.c).
   */
  async #runAgent(task, workdir) {
    const agentTraceStream = createWriteStream(workdir.agentTracePath);
    const systemPrompt = this.profiles.agent
      ? composeProfilePrompt(this.profiles.agent, {
          profilesDir: resolvePath(workdir.cwd, ".claude/agents"),
          trailer: AGENT_SYSTEM_PROMPT,
        })
      : undefined;
    const runner = createAgentRunner({
      cwd: workdir.cwd,
      query: this.query,
      output: agentTraceStream,
      model: this.model,
      maxTurns: this.maxTurns ?? 50,
      allowedTools: BASE_TOOLS,
      settingSources: ["project"],
      systemPrompt,
      redactor: createRedactor(),
    });
    const instructions = await readFile(task.paths.instructions, "utf8");
    let agentError = null;
    try {
      const result = await runner.run(instructions);
      if (!result.success) {
        agentError = {
          message:
            result.error?.message ??
            (result.aborted ? "aborted" : "agent did not succeed"),
          aborted: result.aborted ?? false,
        };
      }
    } catch (e) {
      agentError = { message: e.message ?? String(e), aborted: false };
    } finally {
      await new Promise((r) => agentTraceStream.end(r));
    }
    const summary = await readAgentSummary(workdir.agentTracePath);
    return { ...summary, agentError };
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
      model: this.model,
      skillSetHash,
      familyRevision,
      durationMs,
      agentTracePath: workdir.agentTracePath,
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
 * Pre-flight install gate. Throws synchronously if any task's preflight
 * script is missing or not executable — design § Pre-flight contract:
 * "The harness fails the family at install if any task's preflight script
 * is missing or non-executable, before any agent session starts."
 */
async function assertPreflightExecutable(task) {
  const path = join(task.paths.workdir, "scripts", "preflight.sh");
  try {
    await access(path, constants.X_OK);
  } catch (e) {
    throw new Error(
      `task ${task.id}: preflight script not executable at ${path} (${e.code ?? e.message})`,
    );
  }
}

/**
 * Replay the bare AgentRunner trace into a fresh TraceCollector to recover
 * cost, turn count, and the final assistant text block (the submission).
 */
async function readAgentSummary(tracePath) {
  const collector = createTraceCollector();
  const stream = createReadStream(tracePath);
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) collector.addLine(line);
  const json = collector.toJSON();
  const summary = json.summary ?? {};
  return {
    costUsd:
      typeof summary.totalCostUsd === "number" ? summary.totalCostUsd : 0,
    turns: typeof summary.numTurns === "number" ? summary.numTurns : 0,
    submission: lastAssistantText(json),
  };
}

function lastAssistantText(json) {
  const turns = json.turns ?? [];
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (turn.role !== "assistant") continue;
    const content = turn.content ?? [];
    for (let j = content.length - 1; j >= 0; j--) {
      if (content[j].type === "text" && content[j].text) return content[j].text;
    }
  }
  return "";
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
