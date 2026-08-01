/**
 * Benchmark adapter for the libharness `Judge`. The adapter fills the
 * family's `judge.task.md` template with structured context variables. It
 * runs the judge against the post-run agent CWD. It returns the verdict in
 * the benchmark's `pass`/`fail` vocabulary (mapped from libharness's
 * `success`/`failure`).
 *
 * Template variables available in `judge.task.md`:
 *
 *   {{AGENT_INSTRUCTIONS}}  — contents of agent.task.md
 *   {{AGENT_PROFILE}}       — agent profile body (empty string if none)
 *   {{AGENT_TRACE_PATH}}    — path to agent.ndjson
 *   {{GRADE_RESULT}}        — JSON grade object plus the merged check rows
 *   {{SKILL_SET_HASH}}      — SHA-256 from apm.lock.yaml
 *   {{TASK_ID}}             — task name (directory under tasks/)
 *   {{TASK_DIR}}            — path to the agent working directory
 *
 * The adapter reads the judge verdict directly from the orchestration
 * context's `concluded` flag. It does not parse the trace on the happy path.
 * `parseConcludeFromTrace` stays for offline analysis. It is also a fallback
 * when the runtime ctx is not available, for example when you re-grade a
 * historical run from its judge.ndjson file.
 */

import { createJudge } from "../judge.js";
import { createRedactor } from "../redaction.js";
import { sumTraceCost } from "../cost.js";

/**
 * @typedef {object} JudgeVerdict
 * @property {"pass" | "fail"} verdict
 * @property {string} summary
 * @property {number} costUsd - Cost of the judge's own SDK session.
 */

/**
 * @typedef {object} JudgeContext
 * @property {string} agentInstructions - Contents of agent.task.md.
 * @property {string} agentProfile - Agent profile body (empty string if none).
 * @property {string} skillSetHash - SHA-256 fingerprint from apm.lock.yaml.
 */

/**
 * Run the judge over a completed task run. The judge is a binary gate over
 * the grade's validity. The judge is never a grade itself. `gradeResult`
 * reaches the template as evidence. The verdict stays pass/fail.
 * @param {import("./task-family.js").Task} task
 * @param {import("./workdir.js").Workdir} workdir
 * @param {{verdict: string, gatesPass: boolean, score?: number, malformed?: number, rows: unknown[]}} gradeResult -
 *   The normalized grade plus the merged, source-stamped check rows.
 * @param {{query: Function, model: string, judgeProfile?: string, profilesDir?: string, runtime: import("@forwardimpact/libutil/runtime").Runtime}} deps
 * @param {JudgeContext} [context]
 * @returns {Promise<JudgeVerdict>}
 */
export async function runJudge(task, workdir, gradeResult, deps, context) {
  const runtime = deps.runtime;
  if (!runtime) throw new Error("runtime is required");
  const fs = runtime.fs;
  const template = await fs.readFile(task.paths.judge, "utf8");
  const gradeJson = JSON.stringify(gradeResult, null, 2);
  const taskText = template
    .replaceAll("{{GRADE_RESULT}}", gradeJson)
    .replaceAll("{{AGENT_TRACE_PATH}}", workdir.agentTracePath)
    .replaceAll("{{AGENT_INSTRUCTIONS}}", context?.agentInstructions ?? "")
    .replaceAll("{{AGENT_PROFILE}}", context?.agentProfile ?? "")
    .replaceAll("{{SKILL_SET_HASH}}", context?.skillSetHash ?? "")
    .replaceAll("{{TASK_ID}}", task.id)
    .replaceAll("{{TASK_DIR}}", workdir.cwd);

  const output = fs.createWriteStream(workdir.judgeTracePath);
  const judge = createJudge({
    cwd: workdir.cwd,
    query: deps.query,
    output,
    model: deps.model,
    judgeProfile: deps.judgeProfile,
    profilesDir: deps.profilesDir,
    maxTurns: 25,
    redactor: createRedactor({ runtime }),
    runtime,
  });

  let outcome;
  try {
    outcome = await judge.run(taskText);
  } finally {
    await new Promise((r) => output.end(r));
  }

  // The judge is its own SDK session. Its spend lands in the judge trace we
  // just wrote. It does not land in the supervisor's combined trace. Read the
  // trace back, so the benchmark record's cost includes the judge.
  const judgeTrace = await fs
    .readFile(workdir.judgeTracePath, "utf8")
    .catch(() => "");
  const { totalCostUsd } = sumTraceCost(judgeTrace.split("\n"));

  if (outcome.verdict === null) {
    return {
      verdict: "fail",
      summary: "judge did not conclude",
      costUsd: totalCostUsd,
    };
  }
  return {
    verdict: outcome.verdict === "success" ? "pass" : "fail",
    summary: outcome.summary ?? "",
    costUsd: totalCostUsd,
  };
}

/**
 * Parse the last `Conclude` tool call from an NDJSON trace and map the
 * verdict (`success → pass`, `failure → fail`). The call may carry a
 * judge source or a supervisor source. The supervisor source keeps backward
 * compatibility with pre-Judge-class traces. This function stays for offline
 * analysis. The runtime happy path does not use it.
 * @param {string} tracePath
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @returns {Promise<JudgeVerdict | null>}
 */
export async function parseConcludeFromTrace(tracePath, runtime) {
  if (!runtime) throw new Error("runtime is required");
  const content = await runtime.fs.readFile(tracePath, "utf8");
  let last = null;
  for (const line of content.split("\n")) {
    const candidate = extractConcludeInput(line);
    if (candidate) last = candidate;
  }
  if (!last) return null;
  return {
    verdict: last.verdict === "success" ? "pass" : "fail",
    summary: last.summary ?? "",
  };
}

/**
 * Return the `Conclude` tool input when the line carries a judge-source or
 * supervisor-source assistant message that ends in a `Conclude` tool_use
 * block. Return null otherwise.
 * @param {string} line
 * @returns {{verdict: string, summary?: string} | null}
 */
function extractConcludeInput(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let event;
  try {
    event = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const wrapped =
    event.event && typeof event.source === "string"
      ? { source: event.source, inner: event.event }
      : { source: null, inner: event };
  if (
    wrapped.source !== null &&
    wrapped.source !== "judge" &&
    wrapped.source !== "supervisor"
  ) {
    return null;
  }
  if (wrapped.inner.type !== "assistant") return null;
  const content = wrapped.inner.message?.content ?? wrapped.inner.content;
  if (!Array.isArray(content)) return null;
  let found = null;
  for (const block of content) {
    if (
      block.type === "tool_use" &&
      isConcludeToolName(block.name) &&
      block.input
    ) {
      found = block.input;
    }
  }
  return found;
}

/**
 * The Claude Agent SDK reports MCP tool names as `mcp__<server>__<tool>` when
 * the model invokes them. The orchestration `Conclude` arrives as
 * `mcp__orchestration__Conclude`. Pre-baked supervisor traces (and the
 * libharness-internal envelopes) sometimes carry the bare `Conclude` name.
 * Accept both forms, so the parser is robust to the trace source.
 */
function isConcludeToolName(name) {
  if (typeof name !== "string") return false;
  if (name === "Conclude") return true;
  return name.endsWith("__Conclude");
}
