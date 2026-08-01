/**
 * Judge — one agent session that inspects a completed agent's work and emits
 * a verdict through the orchestration `Conclude` tool. It is a parallel
 * concept to `Supervisor` and `Facilitator`. It runs post-hoc and solo: no
 * peer agents, no message bus, no orchestration loop. The judge reads the
 * task. It can inspect the working directory and the trace with read-only
 * tools. It calls Conclude exactly once.
 *
 * The judge tags trace lines with `source: "judge"`. Consumers can then tell
 * judge sessions apart from supervisor or facilitator sessions in a unified
 * NDJSON envelope.
 *
 * Follows OO+DI: constructor injection, factory function, tests bypass factory.
 */

import { resolve } from "node:path";
import { Writable } from "node:stream";

import { createAgentRunner } from "./agent-runner.js";
import { composeSystemPrompt } from "./profile-prompt.js";
import { SequenceCounter } from "./sequence-counter.js";
import {
  createJudgeToolServer,
  createOrchestrationContext,
} from "./orchestration-toolkit.js";

/**
 * System-prompt trailer for the judge's main thread. The factory always
 * applies it, even when the caller supplies a `judgeProfile`. The profile
 * layers on top of the trailer. `SUPERVISOR_SYSTEM_PROMPT` and
 * `FACILITATOR_SYSTEM_PROMPT` work the same way for their roles.
 */
export const JUDGE_SYSTEM_PROMPT =
  "You are a post-hoc judge for an agent task benchmark. " +
  "The agent already completed its work. An objective invariants step already ran. " +
  "Confirm or override the verdict. To do so, inspect the agent's working directory and trace. " +
  "You have read-only inspection tools: Read, Glob, Grep, and Bash. Do not modify the working directory. " +
  "Conclude ends the session with a verdict ('success' or 'failure') and a one-paragraph summary. " +
  "Set verdict='success' exactly when the agent's work meets the criteria the task states. " +
  "Call Conclude as your final action. Do not deliberate across multiple turns.";

const DEFAULT_JUDGE_ALLOWED_TOOLS = ["Read", "Glob", "Grep", "Bash"];

const devNull = new Writable({
  write(_chunk, _enc, cb) {
    cb();
  },
});

/** Run a single post-hoc judge session and emit a verdict with Conclude. */
export class Judge {
  /**
   * @param {object} deps
   * @param {import("./agent-runner.js").AgentRunner} deps.runner - The judge's AgentRunner.
   * @param {import("stream").Writable} deps.output - Stream to emit tagged NDJSON to.
   * @param {object} deps.ctx - Orchestration context (the Conclude handler writes to it).
   * @param {import("./redaction.js").Redactor} deps.redactor
   * @param {string} [deps.taskAmend] - Opaque addendum. The judge appends it to the task before delivery.
   */
  constructor({ runner, output, ctx, redactor, taskAmend }) {
    if (!runner) throw new Error("runner is required");
    if (!output) throw new Error("output is required");
    if (!ctx) throw new Error("ctx is required");
    if (!redactor) throw new Error("redactor is required");
    this.runner = runner;
    this.output = output;
    this.ctx = ctx;
    this.redactor = redactor;
    this.taskAmend = taskAmend ?? null;
    this.counter = new SequenceCounter();
  }

  /**
   * Run the judge session.
   * @param {string} task - The judge prompt (the caller already substituted the placeholders).
   * @returns {Promise<{success: boolean, verdict: string|null, summary: string|null, turns: number}>}
   */
  async run(task) {
    const fullTask = this.taskAmend ? `${task}\n\n${this.taskAmend}` : task;
    const result = await this.runner.run(fullTask);

    if (this.ctx.concluded) {
      const success = this.ctx.verdict === "success";
      const outcome = {
        success,
        verdict: this.ctx.verdict,
        summary: this.ctx.summary ?? null,
        turns: 1,
      };
      this.emitSummary(outcome);
      return outcome;
    }

    // The judge ended and never called Conclude. Surface that explicitly so
    // callers can distinguish "judge said fail" from "judge never voted."
    const outcome = {
      success: false,
      verdict: null,
      summary: null,
      turns: result.success ? 1 : 0,
    };
    this.emitSummary(outcome);
    return outcome;
  }

  /**
   * Tag a single NDJSON line with `source: "judge"` and emit it to the
   * judge's output stream. The factory wires this into the underlying
   * AgentRunner through the `onLine` callback. The judge's stream is then the
   * single source of truth for the session's trace.
   * @param {string} line
   */
  emitLine(line) {
    const event = JSON.parse(line);
    const tagged = { source: "judge", seq: this.counter.next(), event };
    this.output.write(JSON.stringify(this.redactor.redactValue(tagged)) + "\n");
  }

  /**
   * Emit a final orchestrator summary line in the universal envelope.
   * @param {{success: boolean, verdict?: string|null, summary?: string|null, turns: number}} result
   */
  emitSummary(result) {
    this.output.write(
      JSON.stringify(
        this.redactor.redactValue({
          source: "orchestrator",
          seq: this.counter.next(),
          event: {
            type: "summary",
            success: result.success,
            ...(result.verdict && { verdict: result.verdict }),
            turns: result.turns,
            ...(result.summary && { summary: result.summary }),
          },
        }),
      ) + "\n",
    );
  }
}

/**
 * Factory function. Wires the AgentRunner with the judge orchestration server
 * and the JUDGE_SYSTEM_PROMPT trailer. A `judgeProfile` (when supplied) layers
 * on top of the trailer through `composeSystemPrompt`. This matches the
 * supervisor and facilitator pattern.
 *
 * @param {object} deps
 * @param {string} deps.cwd - Judge working directory. Defaults to the directory whose `.claude/agents` holds `judgeProfile`.
 * @param {function} deps.query - SDK query function (injected so tests can replace it).
 * @param {import("stream").Writable} deps.output - Trace output stream.
 * @param {import("./redaction.js").Redactor} deps.redactor
 * @param {string} [deps.model]
 * @param {number} [deps.maxTurns] - Default 5. The judge should act in turn 1. The other turns leave headroom for tool inspection.
 * @param {string[]} [deps.allowedTools] - Default `["Read","Glob","Grep","Bash"]` for read-only inspection.
 * @param {string} [deps.judgeProfile] - Profile name. `composeSystemPrompt` resolves it into the system prompt.
 * @param {string} [deps.profilesDir] - Defaults to `<cwd>/.claude/agents`.
 * @param {string} [deps.taskAmend]
 * @returns {Judge}
 */
export function createJudge({
  cwd,
  query,
  output,
  redactor,
  model,
  maxTurns,
  allowedTools,
  judgeProfile,
  profilesDir,
  taskAmend,
  runtime,
}) {
  if (!cwd) throw new Error("cwd is required");
  if (!query) throw new Error("query is required");
  if (!output) throw new Error("output is required");
  if (!redactor) throw new Error("redactor is required");
  if (!runtime) throw new Error("runtime is required");

  const resolvedProfilesDir = profilesDir ?? resolve(cwd, ".claude/agents");
  const systemPrompt = composeSystemPrompt({
    role: "agent",
    profile: judgeProfile,
    profilesDir: resolvedProfilesDir,
    trailer: JUDGE_SYSTEM_PROMPT,
    runtime,
  });

  const ctx = createOrchestrationContext();
  ctx.participants = [{ name: "judge", role: "judge" }];
  const judgeServer = createJudgeToolServer(ctx);

  let judge;
  const onLine = (line) => judge.emitLine(line);

  const runner = createAgentRunner({
    cwd,
    query,
    output: devNull,
    model,
    maxTurns: maxTurns ?? 5,
    allowedTools: allowedTools ?? DEFAULT_JUDGE_ALLOWED_TOOLS,
    onLine,
    settingSources: ["project"],
    systemPrompt,
    mcpServers: { orchestration: judgeServer },
    redactor,
  });

  judge = new Judge({ runner, output, ctx, redactor, taskAmend });
  return judge;
}
