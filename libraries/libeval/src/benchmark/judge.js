/**
 * Judge — post-scoring evaluator that runs as a libeval `Supervisor` over a
 * single `AgentRunner` and emits a final verdict via the `Conclude` tool.
 *
 * The judge prompt is templated from `task.paths.judge` with two
 * placeholders the family author wires in:
 *   - `{{SCORING}}`            → JSON-stringified ScoringResult
 *   - `{{AGENT_TRACE_PATH}}`   → absolute path to the agent-under-test trace
 *
 * The verdict is recovered from the judge's NDJSON trace by parsing the last
 * `Conclude` tool call (design Decision 8 / P3): `success → pass`,
 * `failure → fail`. Reusing the trace keeps libeval's `Supervisor` API
 * unchanged.
 */

import { createReadStream, createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createSupervisor } from "../supervisor.js";
import { createRedactor } from "../redaction.js";

/**
 * @typedef {object} JudgeVerdict
 * @property {"pass" | "fail"} verdict
 * @property {string} summary
 */

/**
 * Run the judge over a completed task run.
 * @param {import("./task-family.js").Task} task
 * @param {import("./workdir.js").Workdir} workdir
 * @param {import("./scorer.js").ScoringResult} scoring
 * @param {{query: Function, model: string, judgeProfile?: string}} deps
 * @returns {Promise<JudgeVerdict>}
 */
export async function runJudge(task, workdir, scoring, deps) {
  const template = await readFile(task.paths.judge, "utf8");
  const taskText = template
    .replaceAll("{{SCORING}}", JSON.stringify(scoring, null, 2))
    .replaceAll("{{AGENT_TRACE_PATH}}", workdir.agentTracePath);

  const output = createWriteStream(workdir.judgeTracePath);
  const supervisor = createSupervisor({
    supervisorCwd: workdir.cwd,
    agentCwd: workdir.cwd,
    query: deps.query,
    output,
    model: deps.model,
    supervisorProfile: deps.judgeProfile,
    agentProfile: undefined,
    maxTurns: 1,
    redactor: createRedactor(),
  });

  try {
    await supervisor.run(taskText);
  } finally {
    await new Promise((r) => output.end(r));
  }

  const parsed = await parseConcludeFromTrace(workdir.judgeTracePath);
  if (parsed) return parsed;
  return { verdict: "fail", summary: "judge did not conclude" };
}

/**
 * Parse the last supervisor-source `Conclude` tool call from a judge trace
 * and map the verdict (`success → pass`, `failure → fail`).
 * @param {string} tracePath
 * @returns {Promise<JudgeVerdict | null>}
 */
export async function parseConcludeFromTrace(tracePath) {
  const stream = createReadStream(tracePath);
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let last = null;
  for await (const line of rl) {
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
 * Return the `Conclude` tool input if the line carries a supervisor-source
 * assistant message ending in a `Conclude` tool_use block; null otherwise.
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
  if (wrapped.source !== null && wrapped.source !== "supervisor") return null;
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
 * The Claude Agent SDK reports MCP tool names as
 * `mcp__<server>__<tool>` when the model invokes them — the orchestration
 * `Conclude` arrives as `mcp__orchestration__Conclude`. Pre-baked
 * supervisor traces (and the libeval-internal envelopes) sometimes carry
 * the bare `Conclude` name. Accept both forms so the parser is robust to
 * trace source.
 */
function isConcludeToolName(name) {
  if (typeof name !== "string") return false;
  if (name === "Conclude") return true;
  return name.endsWith("__Conclude");
}
