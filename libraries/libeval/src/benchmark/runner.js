/**
 * BenchmarkRunner (spec 870 plan-a Step 8).
 *
 * Sole orchestrator for a family run. Calls `install` once, then iterates
 * (task × runIndex) serially, threading each through start → agent → score
 * → judge → teardown. Yields validated `ResultRecord`s and appends them
 * to `<output>/results.jsonl`.
 *
 * Pre-flight install gate (existence + executable bit on
 * `workdir/scripts/preflight.sh`, optional judge-profile staging check)
 * fails the family before any agent session — broken templates never
 * spend agent cost.
 *
 * Per design Decision 14, v1 runs the agent-under-test through a bare
 * `AgentRunner` (no live supervisor). The judge phase still composes
 * `Supervisor` per Decision 7.
 */

import {
  accessSync,
  constants as fsConstants,
  createWriteStream,
} from "node:fs";
import { open, readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { resolve, join, dirname } from "node:path";
import { loadTaskFamily, assertJudgeProfileStaged } from "./task-family.js";
import { installApm } from "./apm-installer.js";
import { WorkdirManager } from "./workdir.js";
import { runScoring } from "./scorer.js";
import { runJudge } from "./judge.js";
import { validateResultRecord } from "./result.js";
import { createAgentRunner } from "../agent-runner.js";
import { createTraceCollector } from "../trace-collector.js";
import { composeProfilePrompt } from "../profile-prompt.js";
import { AGENT_SYSTEM_PROMPT } from "../supervisor.js";
import { createRedactor } from "../redaction.js";

/**
 * Module-private default tool allow-list — one tool set for v1 (design
 * Decision 9: no permissions broker until v2).
 */
const BASE_TOOLS = ["Bash", "Read", "Glob", "Grep", "Write", "Edit"];

function lastAssistantText(traceJson) {
  let last = "";
  for (const turn of traceJson.turns ?? []) {
    if (turn.role !== "assistant") continue;
    const blocks = turn.content ?? [];
    for (const block of blocks) {
      if (
        block.type === "text" &&
        typeof block.text === "string" &&
        block.text
      ) {
        last = block.text;
      }
    }
  }
  return last;
}

async function parseAgentTrace(tracePath) {
  const collector = createTraceCollector();
  const rl = createInterface({
    input: createReadStream(tracePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) collector.addLine(line);
  const json = collector.toJSON();
  return {
    costUsd: json.summary?.totalCostUsd ?? 0,
    turns: json.summary?.numTurns ?? 0,
    submission: lastAssistantText(json),
  };
}

function assertPreflightExecutable(task) {
  const path = join(task.paths.workdir, "scripts", "preflight.sh");
  try {
    accessSync(path, fsConstants.X_OK);
  } catch {
    throw new Error(
      `Pre-flight script missing or not executable: ${path} ` +
        `(spec 870 § Pre-flight contract — each task must ship one).`,
    );
  }
}

function buildPreflightFailureRecord(opts, task, runIndex, workdir, ctx) {
  return {
    taskId: task.id,
    runIndex,
    verdict: "fail",
    preflightError: workdir.preflightError,
    costUsd: 0,
    turns: 0,
    profiles: {
      agent: opts.profiles?.agent ?? null,
      supervisor: null,
      judge: opts.profiles?.judge ?? null,
    },
    model: opts.model,
    skillSetHash: ctx.skillSetHash,
    familyRevision: ctx.familyRevision,
    durationMs: Date.now() - ctx.t0,
  };
}

async function runAgentSession(opts, task, workdir) {
  const agentTraceStream = createWriteStream(workdir.agentTracePath);
  const redactor = createRedactor();
  const systemPrompt = opts.profiles?.agent
    ? composeProfilePrompt(opts.profiles.agent, {
        profilesDir: resolve(workdir.cwd, ".claude/agents"),
        trailer: AGENT_SYSTEM_PROMPT,
      })
    : undefined;
  const runner = createAgentRunner({
    cwd: workdir.cwd,
    query: opts.query,
    output: agentTraceStream,
    model: opts.model,
    maxTurns: opts.maxTurns ?? 50,
    allowedTools: BASE_TOOLS,
    settingSources: ["project"],
    systemPrompt,
    redactor,
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
  } catch (err) {
    agentError = { message: err.message, aborted: false };
  }
  await new Promise((r) => agentTraceStream.end(r));
  return agentError;
}

function buildResultRecord(
  opts,
  task,
  runIndex,
  workdir,
  scoring,
  judgeVerdict,
  traceSummary,
  ctx,
) {
  const verdict =
    scoring.verdict === "pass" && judgeVerdict.verdict === "pass"
      ? "pass"
      : "fail";
  return {
    taskId: task.id,
    runIndex,
    verdict,
    scoring,
    judgeVerdict,
    submission: traceSummary.submission,
    costUsd: traceSummary.costUsd,
    turns: traceSummary.turns,
    agentTracePath: workdir.agentTracePath,
    judgeTracePath: workdir.judgeTracePath,
    profiles: {
      agent: opts.profiles?.agent ?? null,
      supervisor: null,
      judge: opts.profiles?.judge ?? null,
    },
    model: opts.model,
    skillSetHash: ctx.skillSetHash,
    familyRevision: ctx.familyRevision,
    durationMs: Date.now() - ctx.t0,
  };
}

/**
 * Sole orchestrator for a family run.
 */
export class BenchmarkRunner {
  /**
   * @param {object} deps
   * @param {string|import("./task-family.js").TaskFamily} deps.family - Path, git URL, or loaded family.
   * @param {number} deps.runs - Repeat count per task (≥ 1).
   * @param {string} deps.output - Run-output directory.
   * @param {string} deps.model - Model id (e.g. `claude-opus-4-7`).
   * @param {{ agent?: string, judge?: string }} [deps.profiles] - Profile names.
   * @param {Function} deps.query - SDK query function (DI; tests inject a mock).
   * @param {number} [deps.maxTurns] - Agent-under-test budget (default 50).
   */
  constructor({ family, runs, output, model, profiles, query, maxTurns }) {
    if (!family) throw new Error("family is required");
    if (!runs || runs < 1) throw new Error("runs must be ≥ 1");
    if (!output) throw new Error("output is required");
    if (!model) throw new Error("model is required");
    if (!query) throw new Error("query is required");
    this.family = family;
    this.runs = runs;
    this.output = output;
    this.model = model;
    this.profiles = profiles ?? {};
    this.query = query;
    this.maxTurns = maxTurns;
  }

  /**
   * Async-iterate the family: install once, run preflight gates, then yield
   * one validated `ResultRecord` per `(task, runIndex)`.
   * @returns {AsyncIterable<object>}
   */
  async *run() {
    const family =
      typeof this.family === "string"
        ? await loadTaskFamily(this.family)
        : this.family;
    const { stagingDir, skillSetHash } = await installApm(family, this.output);

    const tasks = Array.from(family.tasks());
    for (const task of tasks) assertPreflightExecutable(task);
    if (this.profiles.judge) {
      await assertJudgeProfileStaged(family, stagingDir, this.profiles.judge);
    }

    const resultsPath = join(this.output, "results.jsonl");
    const resultsFile = await open(resultsPath, "a");
    try {
      const wm = new WorkdirManager({
        stagingDir,
        runOutputDir: this.output,
      });
      const opts = {
        query: this.query,
        model: this.model,
        profiles: this.profiles,
        maxTurns: this.maxTurns,
      };

      for (const task of tasks) {
        for (let runIndex = 0; runIndex < this.runs; runIndex++) {
          const t0 = Date.now();
          const ctx = {
            skillSetHash,
            familyRevision: family.familyRevision,
            t0,
          };
          const workdir = await wm.start(task, runIndex);
          if (workdir.preflightError) {
            const record = buildPreflightFailureRecord(
              opts,
              task,
              runIndex,
              workdir,
              ctx,
            );
            await this.#emit(resultsFile, record);
            yield record;
            await wm.teardown(workdir);
            continue;
          }
          await runAgentSession(opts, task, workdir);
          const traceSummary = await parseAgentTrace(workdir.agentTracePath);
          const scoring = await runScoring(task, {
            cwd: workdir.cwd,
            port: workdir.port,
            runDir: dirname(workdir.cwd),
          });
          const judgeVerdict = await runJudge(task, workdir, scoring, {
            query: this.query,
            model: this.model,
            judgeProfile: this.profiles.judge,
          });
          const record = buildResultRecord(
            opts,
            task,
            runIndex,
            workdir,
            scoring,
            judgeVerdict,
            traceSummary,
            ctx,
          );
          await this.#emit(resultsFile, record);
          yield record;
          await wm.teardown(workdir);
        }
      }
    } finally {
      await resultsFile.close();
    }
  }

  async #emit(resultsFile, record) {
    try {
      validateResultRecord(record);
      await resultsFile.appendFile(JSON.stringify(record) + "\n");
    } catch (err) {
      // The runner constructed the record — a validation failure here is a
      // bug in the runner itself, not a user-input issue. Drop a noisy
      // fallback line so the run is observable rather than silently
      // discarding a paid agent execution.
      const fallback = {
        taskId: record.taskId,
        runIndex: record.runIndex,
        verdict: "fail",
        schemaError: err.message,
      };
      await resultsFile.appendFile(JSON.stringify(fallback) + "\n");
    }
  }
}

/**
 * Factory function — convenience for tests and CLI callers.
 * @param {ConstructorParameters<typeof BenchmarkRunner>[0]} deps
 * @returns {BenchmarkRunner}
 */
export function createBenchmarkRunner(deps) {
  return new BenchmarkRunner(deps);
}
