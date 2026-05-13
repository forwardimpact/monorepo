/**
 * BenchmarkRunner — sole orchestrator for a task-family benchmark run.
 *
 * Phases per (task, runIndex):
 *   1. WorkdirManager.start → seed CWD + run pre-flight probe
 *   2. Supervisor relay (agent + supervisor) → produce traces + submission
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
import { mkdir, readFile, unlink } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join, resolve as resolvePath } from "node:path";

import { DEFAULT_ENV_ALLOWLIST, createRedactor } from "../redaction.js";
import { createSupervisor } from "../supervisor.js";
import { installApm as defaultInstallApm } from "./apm-installer.js";
import { runJudge } from "./judge.js";
import { validateResultRecord } from "./result.js";
import { runScoring } from "./scorer.js";
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
   * @param {Function} [opts.runScoring] - Test seam: replaces `runScoring`.
   *   Same contract as `runScoring(task, ctx)`. Internal testing only.
   * @param {Function} [opts.runJudge] - Test seam: replaces `runJudge`. Same
   *   contract as `runJudge(task, workdir, scoring, deps)`. Internal testing
   *   only.
   * @param {Function} [opts.installApm] - Test seam: replaces `installApm`.
   *   Same contract as `installApm(family, outputDir)`. Lets tests inject a
   *   fake `apm` spawn (or skip the install entirely) so the suite never
   *   shells out to a real `apm` binary. Internal testing only.
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
    termGraceMs,
    // Test seams — default to the real implementations.
    runAgent,
    runScoring: runScoringHook,
    runJudge: runJudgeHook,
    installApm: installApmHook,
  }) {
    if (!family) throw new Error("family is required");
    if (!Number.isInteger(runs) || runs < 1)
      throw new Error("runs must be an integer ≥ 1");
    if (!output) throw new Error("output is required");
    if (!agentModel) throw new Error("agentModel is required");
    if (!query) throw new Error("query is required");
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
    this.termGraceMs = termGraceMs;
    this._runAgentHook = runAgent ?? null;
    this._runScoringHook = runScoringHook ?? runScoring;
    this._runJudgeHook = runJudgeHook ?? runJudge;
    this._installApmHook = installApmHook ?? defaultInstallApm;
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
    const { stagingDir, skillSetHash, judgeProfilesDir } =
      await this._installApmHook(family, this.output);

    const tasks = family.tasks();
    if (this.profiles.judge) {
      await assertJudgeProfileStaged(
        family,
        judgeProfilesDir,
        this.profiles.judge,
      );
    }

    const wm = createWorkdirManager({
      stagingDir,
      runOutputDir: this.output,
      termGraceMs: this.termGraceMs,
      familyRootPath: family.rootPath,
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
      let judgeVerdict = null;
      if (task.paths.judge) {
        const judgeContext = await this.#buildJudgeContext(
          task,
          workdir,
          skillSetHash,
        );
        judgeVerdict = await this._runJudgeHook(
          task,
          workdir,
          scoring,
          {
            query: this.query,
            model: this.judgeModel,
            judgeProfile: this.profiles.judge ?? undefined,
            profilesDir: judgeProfilesDir,
          },
          judgeContext,
        );
      }
      const verdict =
        scoring.verdict === "pass" &&
        (judgeVerdict === null || judgeVerdict.verdict === "pass")
          ? "pass"
          : "fail";
      const record = {
        taskId: task.id,
        runIndex,
        verdict,
        scoring,
        submission,
        ...(judgeVerdict && { judgeVerdict }),
        costUsd,
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
   * Run the agent-under-test via a Supervisor relay. The supervisor writes
   * a combined tagged NDJSON trace; after the session we split it into
   * agent.ndjson and supervisor.ndjson and extract cost/turns/submission.
   */
  async #runAgent(task, workdir) {
    const combinedPath = join(workdir.runDir, ".combined.ndjson");
    const combinedStream = createWriteStream(combinedPath);
    const supervisorInstructions = task.paths.supervisor
      ? await readFile(task.paths.supervisor, "utf8").catch(() => null)
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
      }),
    });
    const instructions = await readFile(task.paths.instructions, "utf8");
    let agentError = null;
    try {
      const result = await supervisor.run(instructions);
      if (!result.success && !result.concluded) {
        agentError = { message: "supervisor did not succeed", aborted: false };
      }
    } catch (e) {
      agentError = { message: e.message ?? String(e), aborted: false };
    } finally {
      await new Promise((r) => combinedStream.end(r));
    }
    const summary = await splitAndSummarize(
      combinedPath,
      workdir.agentTracePath,
      workdir.supervisorTracePath,
    );
    await unlink(combinedPath).catch(() => {});
    return { ...summary, agentError };
  }

  async #buildJudgeContext(task, workdir, skillSetHash) {
    const agentInstructions = await readFile(task.paths.instructions, "utf8");
    let agentProfile = "";
    if (this.profiles.agent) {
      const profilePath = resolvePath(
        workdir.cwd,
        ".claude/agents",
        `${this.profiles.agent}.md`,
      );
      agentProfile = await readFile(profilePath, "utf8").catch(() => "");
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
 * Split the combined supervisor trace into agent and supervisor files, and
 * extract cost, turn count, and submission in a single pass. Agent-source
 * events go to `agentPath`; supervisor and orchestrator events go to
 * `supervisorPath`.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: stream-splitting state machine
async function splitAndSummarize(combinedPath, agentPath, supervisorPath) {
  const agentStream = createWriteStream(agentPath);
  const supStream = createWriteStream(supervisorPath);
  const rl = createInterface({
    input: createReadStream(combinedPath),
    crlfDelay: Infinity,
  });
  let agentCost = 0;
  let supervisorCost = 0;
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
    if (event.source === "agent") {
      if (inner.type === "result" && typeof inner.total_cost_usd === "number") {
        agentCost = inner.total_cost_usd;
      }
      if (inner.type === "assistant") {
        const text = extractText(inner);
        if (text) submission = text;
      }
    }
    if (event.source === "supervisor") {
      if (inner.type === "result" && typeof inner.total_cost_usd === "number") {
        supervisorCost = inner.total_cost_usd;
      }
    }
    if (event.source === "orchestrator" && inner.type === "summary") {
      turns = inner.turns ?? 0;
    }
  }
  await Promise.all([
    new Promise((r) => agentStream.end(r)),
    new Promise((r) => supStream.end(r)),
  ]);
  return { costUsd: agentCost + supervisorCost, turns, submission };
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
