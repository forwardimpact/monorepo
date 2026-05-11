/**
 * Benchmark adapter for the libeval `Judge`. Templates the family's
 * `judge.task.md` ({{SCORING}} / {{AGENT_TRACE_PATH}} substitution), runs the
 * judge against the post-run agent CWD, and returns the verdict in the
 * benchmark's `pass`/`fail` vocabulary (mapped from libeval's
 * `success`/`failure`).
 *
 * The judge verdict is captured from the orchestration context's
 * `concluded` flag directly — no trace parsing on the happy path.
 * `parseConcludeFromTrace` is preserved for offline analysis and as a
 * fallback when the runtime ctx isn't available (e.g. re-grading a
 * historical run from its judge.ndjson file).
 */

import { createReadStream, createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createJudge } from "../judge.js";
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
  const judge = createJudge({
    cwd: workdir.cwd,
    query: deps.query,
    output,
    model: deps.model,
    judgeProfile: deps.judgeProfile,
    maxTurns: 5,
    redactor: createRedactor(),
  });

  let outcome;
  try {
    outcome = await judge.run(taskText);
  } finally {
    await new Promise((r) => output.end(r));
  }

  if (outcome.verdict === null) {
    return { verdict: "fail", summary: "judge did not conclude" };
  }
  return {
    verdict: outcome.verdict === "success" ? "pass" : "fail",
    summary: outcome.summary ?? "",
  };
}

/**
 * Parse the last judge-source (or supervisor-source, for backward compat
 * with pre-Judge-class traces) `Conclude` tool call from an NDJSON trace
 * and map the verdict (`success → pass`, `failure → fail`). Preserved for
 * offline analysis; not used on the runtime happy path.
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
 * Return the `Conclude` tool input if the line carries a judge-source or
 * supervisor-source assistant message ending in a `Conclude` tool_use
 * block; null otherwise.
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
