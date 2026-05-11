/**
 * Judge (spec 870 plan-a Step 6).
 *
 * The judge composes a libeval `Supervisor` over a single `AgentRunner`
 * (design Decision 7) — `Conclude` is registered only on supervisor tool
 * servers, so a bare `AgentRunner` cannot emit a verdict.
 *
 * Family-shipped paths and scoring data reach the LLM via prompt
 * templating (env vars do not propagate through the SDK to the model):
 *
 *   `{{SCORING}}`          ← JSON-stringified scoring outcome
 *   `{{AGENT_TRACE_PATH}}` ← absolute path to the agent-under-test trace
 *
 * Family authors must place these placeholders in `judge.task.md`; the
 * runner does not inject them outside the template.
 *
 * After the supervisor run, `parseConcludeFromTrace` walks the judge's
 * NDJSON trace and recovers the supervisor's last `Conclude` tool_use.
 * The libeval verdict enum (`success`/`failure`) is mapped to
 * pass-pool vocabulary (`pass`/`fail`) for the result record (design
 * Decision 8). No `Conclude` → `{ verdict: "fail", summary: "judge did
 * not conclude" }` is surfaced by the caller.
 */

import { readFile } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { createSupervisor } from "../supervisor.js";
import { createRedactor } from "../redaction.js";

/**
 * @typedef {{ verdict: "pass" | "fail", summary: string }} JudgeOutcome
 */

const NO_CONCLUDE_OUTCOME = Object.freeze({
  verdict: "fail",
  summary: "judge did not conclude",
});

/**
 * @param {import("./task-family.js").Task} task
 * @param {import("./workdir.js").Workdir} workdir
 * @param {import("./scorer.js").ScoringOutcome} scoring
 * @param {{ query: Function, model: string, judgeProfile?: string }} deps
 * @returns {Promise<JudgeOutcome>}
 */
export async function runJudge(task, workdir, scoring, deps) {
  const template = await readFile(task.paths.judge, "utf8");
  const taskText = template
    .replaceAll("{{SCORING}}", JSON.stringify(scoring, null, 2))
    .replaceAll("{{AGENT_TRACE_PATH}}", workdir.agentTracePath);

  const output = createWriteStream(workdir.judgeTracePath);
  const redactor = createRedactor();
  const supervisor = createSupervisor({
    supervisorCwd: workdir.cwd,
    agentCwd: workdir.cwd,
    query: deps.query,
    output,
    model: deps.model,
    supervisorProfile: deps.judgeProfile,
    agentProfile: undefined,
    maxTurns: 1,
    redactor,
  });

  await supervisor.run(taskText);
  await new Promise((r) => output.end(r));

  const parsed = await parseConcludeFromTrace(workdir.judgeTracePath);
  return parsed ?? { ...NO_CONCLUDE_OUTCOME };
}

function parseEnvelope(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function concludeFromAssistantBlocks(content) {
  if (!Array.isArray(content)) return null;
  let match = null;
  for (const block of content) {
    if (block.type !== "tool_use" || block.name !== "Conclude") continue;
    const verdict = block.input?.verdict;
    if (verdict !== "success" && verdict !== "failure") continue;
    match = {
      verdict: verdict === "success" ? "pass" : "fail",
      summary: block.input?.summary ?? "",
    };
  }
  return match;
}

function concludeFromEnvelope(envelope) {
  if (!envelope) return null;
  const source = envelope.source;
  if (source && source !== "supervisor") return null;
  const event = envelope.event ?? envelope;
  if (event.type !== "assistant") return null;
  const content = event.message?.content ?? event.content;
  return concludeFromAssistantBlocks(content);
}

/**
 * Parse a judge NDJSON trace and return the supervisor's final Conclude
 * verdict (libeval `success`/`failure` → pass-pool `pass`/`fail`).
 *
 * Returns `null` when no Conclude tool_use is present. When multiple
 * Conclude calls exist, the LAST one wins — supervisor turns can revisit
 * verdicts via mid-turn review and the trailing call is the authoritative
 * one.
 *
 * @param {string} tracePath
 * @returns {Promise<JudgeOutcome | null>}
 */
export async function parseConcludeFromTrace(tracePath) {
  const rl = createInterface({
    input: createReadStream(tracePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let last = null;
  for await (const raw of rl) {
    const found = concludeFromEnvelope(parseEnvelope(raw));
    if (found) last = found;
  }
  return last;
}
