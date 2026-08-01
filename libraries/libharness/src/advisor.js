/**
 * Advisor — the judge's mid-loop sibling. It is a solo, tool-restricted,
 * one-shot `AgentRunner` session on a stronger model. Its final text is the
 * advice. Each consult forwards the caller's whole recorded context (system
 * prompt, delivered prompts, transcript so far) plus a focused question. The
 * advisor can inspect files read-only. It holds no write, execute, subagent,
 * or orchestration tools. It never appears on the message bus.
 *
 * Consults are stateless. Each call runs one fresh session that reads the
 * caller's context as it stands. Consults also fail open. A timeout, an
 * error, and an abort all resolve to an in-band `{unavailable}` result, so
 * the caller's session never stalls or crashes on a consult.
 *
 * Follows OO+DI: factory function, tests inject a fake `query`.
 */

import { Writable } from "node:stream";

import { createAgentRunner } from "./agent-runner.js";
import { composeSystemPrompt } from "./profile-prompt.js";

/**
 * System-prompt trailer for the advisor session. It fixes the response
 * contract (spec criterion "Advice is bounded"). The contract is an
 * assessment, a recommendation, and unsolicited findings, with a stated
 * length ceiling.
 */
export const ADVISOR_SYSTEM_PROMPT =
  "You are a consulted specialist. You are not a worker. " +
  "Another agent paused its work to ask you one question. Its full session context and the question are in the task. " +
  "You may Read, Glob, and Grep the files the transcript names to ground your advice. You must never modify anything. " +
  "Respond in one turn of prose. The caller receives your final text verbatim. " +
  "Structure the response as: assessment (what you see), recommendation (what to do and why), and unsolicited findings (anything important the caller did not ask about). " +
  "Keep the whole response to at most three short paragraphs. " +
  "Do not ask follow-up questions. The caller cannot reply.";

/**
 * Consult-guidance fragment for caller system prompts, present only when
 * the session runs with an advisor model. It steers the caller's judgment.
 * It mandates nothing.
 * @param {number} maxUses - The session-wide consult budget.
 * @returns {string}
 */
export function advisorGuidance(maxUses) {
  return (
    "An `Advisor` tool is available. It takes one focused question per call. A stronger model that sees your full session context answers it. " +
    "A consult pays off at hard decision points, such as architectural forks, unclear root causes, and trade-offs you cannot rank. " +
    "A consult also pays off early, before work builds on an unvalidated assumption. " +
    "It does not pay off for routine reads, writes, or searches. " +
    `The session-wide budget is ${maxUses} consult${maxUses === 1 ? "" : "s"}, which all participants share. ` +
    "A consult is your judgment. It is never mandatory."
  );
}

/**
 * Create the session-wide consult budget. Every caller's tool handler
 * shares it. The tool handler enforces the budget in code. The prompt does
 * not enforce it.
 * @param {number} maxUses
 * @returns {{maxUses: number, used: number}}
 */
export function createAdvisorBudget(maxUses) {
  return { maxUses, used: 0 };
}

/**
 * Fold the consult guidance into an existing run-specific amendment when
 * the advisor is enabled (budget present). Return the amendment unchanged
 * otherwise, so advisor-off prompts stay byte-identical.
 * @param {string|undefined} amend - The existing amendment, if any.
 * @param {{maxUses: number}|null} budget
 * @returns {string|undefined}
 */
export function withAdvisorGuidance(amend, budget) {
  if (!budget) return amend;
  return [amend, advisorGuidance(budget.maxUses)].filter(Boolean).join("\n\n");
}

/**
 * Consult timeout. It is generous for a read-a-few-files-and-answer
 * session. It is also the universal guard in modes with no stop path.
 */
export const DEFAULT_CONSULT_TIMEOUT_MS = 300_000;

const ADVISOR_ALLOWED_TOOLS = ["Read", "Glob", "Grep"];

// Under the harness's always-on bypassPermissions, `allowedTools` alone is
// not structural. `disallowedTools` removes tools from the model's context.
// The lead runners get the same treatment. The advisor's contract is
// stricter than the leads' (read-only inspection, nothing else). So the
// list also removes the write-capable and non-inspection built-ins that the
// lead convention leaves in.
const ADVISOR_DISALLOWED_TOOLS = [
  "Bash",
  "Write",
  "Edit",
  "NotebookEdit",
  "Agent",
  "Task",
  "TaskOutput",
  "TaskStop",
  "TodoWrite",
  "WebFetch",
  "WebSearch",
];

const devNull = new Writable({
  write(_chunk, _enc, cb) {
    cb();
  },
});

/**
 * Create a per-caller advisor that closes over that caller's transcript
 * recorder.
 *
 * @param {object} deps
 * @param {string} deps.model - Advisor model id.
 * @param {string} deps.cwd - The caller's working directory, so the read-only tools see the caller's files.
 * @param {function} deps.query - SDK query function (tests inject it).
 * @param {{render: () => string}} deps.recorder - The caller's transcript recorder.
 * @param {import("./redaction.js").Redactor} deps.redactor
 * @param {import("@forwardimpact/libutil/runtime").Runtime} deps.runtime - Clock surface for timeout and duration.
 * @param {function} deps.onLine - Re-emitter for the advisor session's NDJSON lines (the caller tags them `source: "advisor"`).
 * @param {number} [deps.maxTurns] - Default 5, which is single-digit per the spec criterion.
 * @param {number} [deps.timeoutMs] - Default `DEFAULT_CONSULT_TIMEOUT_MS`.
 * @returns {{consult: (question: string) => Promise<{advice?: string, unavailable?: boolean, reason?: string, durationMs: number}>, abort: () => void}}
 */
export function createAdvisor({
  model,
  cwd,
  query,
  recorder,
  redactor,
  runtime,
  onLine,
  maxTurns,
  timeoutMs,
}) {
  if (!model) throw new Error("model is required");
  if (!cwd) throw new Error("cwd is required");
  if (!query) throw new Error("query is required");
  if (!recorder) throw new Error("recorder is required");
  if (!redactor) throw new Error("redactor is required");
  if (!runtime) throw new Error("runtime is required");
  if (!onLine) throw new Error("onLine is required");
  const resolvedMaxTurns = maxTurns ?? 5;
  const resolvedTimeoutMs = timeoutMs ?? DEFAULT_CONSULT_TIMEOUT_MS;

  /** @type {import("./agent-runner.js").AgentRunner|null} */
  let currentRunner = null;

  return {
    /**
     * Run one fresh advisor session over the caller's context as it
     * stands plus the question. It never rejects. Every failure shape
     * resolves to `{unavailable, reason}` (fail-open).
     * @param {string} question
     */
    async consult(question) {
      const started = runtime.clock.now();
      const runner = createAgentRunner({
        cwd,
        query,
        output: devNull,
        model,
        maxTurns: resolvedMaxTurns,
        allowedTools: ADVISOR_ALLOWED_TOOLS,
        disallowedTools: ADVISOR_DISALLOWED_TOOLS,
        onLine,
        settingSources: ["project"],
        systemPrompt: composeSystemPrompt({
          role: "agent",
          trailer: ADVISOR_SYSTEM_PROMPT,
          runtime,
        }),
        redactor,
      });
      currentRunner = runner;
      const task = `${recorder.render()}\n\n<consult_question>\n${question}\n</consult_question>`;
      const timer = runtime.clock.setTimeout(
        () => runner.currentAbortController?.abort(),
        resolvedTimeoutMs,
      );
      try {
        const result = await runner.run(task);
        const durationMs = runtime.clock.now() - started;
        if (result.aborted) {
          return {
            unavailable: true,
            reason: "timed out or aborted",
            durationMs,
          };
        }
        if (!result.success) {
          return {
            unavailable: true,
            reason: result.error?.message ?? "advisor session failed",
            durationMs,
          };
        }
        return { advice: result.text, durationMs };
      } catch (err) {
        return {
          unavailable: true,
          reason: err?.message ?? "advisor session failed",
          durationMs: runtime.clock.now() - started,
        };
      } finally {
        runtime.clock.clearTimeout(timer);
        currentRunner = null;
      }
    },

    /**
     * Abort the in-flight consult, if any. A consult blocks the tool
     * call, so one caller cannot overlap its own consults. Each advisor
     * belongs to one caller, so the code tracks at most one runner.
     */
    abort() {
      currentRunner?.currentAbortController?.abort();
    },
  };
}
