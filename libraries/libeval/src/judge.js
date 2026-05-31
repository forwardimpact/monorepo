/**
 * Judge — one agent session that inspects a completed agent's work and emits
 * a verdict via the orchestration `Conclude` tool. Parallel concept to
 * `Supervisor` and `Facilitator`, but post-hoc and solo: no peer agents,
 * no message bus, no orchestration loop. The judge reads the task, optionally
 * inspects the working directory and trace via read-only tools, and calls
 * Conclude exactly once.
 *
 * Trace lines are tagged `source: "judge"` so consumers can distinguish
 * judge sessions from supervisor or facilitator sessions in a unified
 * NDJSON envelope.
 *
 * Follows OO+DI: constructor injection, factory function, tests bypass factory.
 */

import { resolve } from "node:path";
import { Writable } from "node:stream";

import { createAgentRunner } from "./agent-runner.js";
import { composeProfilePrompt } from "./profile-prompt.js";
import { SequenceCounter } from "./sequence-counter.js";
import {
  createJudgeToolServer,
  createOrchestrationContext,
} from "./orchestration-toolkit.js";

/**
 * System-prompt trailer appended to the judge's main thread. Always applied,
 * even when a `judgeProfile` is supplied — the profile layers on top of the
 * trailer, the same way `SUPERVISOR_SYSTEM_PROMPT` and
 * `FACILITATOR_SYSTEM_PROMPT` work for their respective roles.
 */
export const JUDGE_SYSTEM_PROMPT =
  "You are a post-hoc judge for an agent task benchmark. " +
  "The agent has already completed its work and an objective invariants step has already run; your role is to confirm or override the verdict by inspecting the agent's working directory and trace. " +
  "You have read-only inspection tools — Read, Glob, Grep, Bash — to investigate; do not modify the working directory. " +
  "Conclude ends the session with a verdict ('success' or 'failure') and a one-paragraph summary; verdict='success' iff the agent's work meets the criteria stated in the task. " +
  "Call Conclude as your final action — do not deliberate across multiple turns.";

const DEFAULT_JUDGE_ALLOWED_TOOLS = ["Read", "Glob", "Grep", "Bash"];

const devNull = new Writable({
  write(_chunk, _enc, cb) {
    cb();
  },
});

/** Run a single post-hoc judge session and emit a verdict via Conclude. */
export class Judge {
  /**
   * @param {object} deps
   * @param {import("./agent-runner.js").AgentRunner} deps.runner - The judge's AgentRunner.
   * @param {import("stream").Writable} deps.output - Stream to emit tagged NDJSON to.
   * @param {object} deps.ctx - Orchestration context (the Conclude handler writes to it).
   * @param {import("./redaction.js").Redactor} deps.redactor
   * @param {string} [deps.taskAmend] - Opaque addendum appended to the task before delivery.
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
   * @param {string} task - The judge prompt (with placeholders already substituted).
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

    // The judge ended without calling Conclude. Surface that explicitly so
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
   * judge's output stream. Wired into the underlying AgentRunner via the
   * `onLine` callback so the judge's stream is the single source of truth
   * for the session's trace.
   * @param {string} line
   */
  emitLine(line) {
    const event = JSON.parse(line);
    const tagged = { source: "judge", seq: this.counter.next(), event };
    this.output.write(JSON.stringify(this.redactor.redactValue(tagged)) + "\n");
  }

  /**
   * Emit a final orchestrator summary line, wrapped in the universal envelope.
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
 * Factory function — wires the AgentRunner with the judge orchestration server
 * and the JUDGE_SYSTEM_PROMPT trailer. A `judgeProfile` (when supplied) layers
 * on top of the trailer via `composeProfilePrompt`, matching the
 * supervisor/facilitator pattern.
 *
 * @param {object} deps
 * @param {string} deps.cwd - Judge working directory. Defaults to the directory whose `.claude/agents` holds `judgeProfile`.
 * @param {function} deps.query - SDK query function (injected for testing).
 * @param {import("stream").Writable} deps.output - Trace output stream.
 * @param {import("./redaction.js").Redactor} deps.redactor
 * @param {string} [deps.model]
 * @param {number} [deps.maxTurns] - Default 5 (the judge is expected to act in turn 1; 5 leaves headroom for tool inspection).
 * @param {string[]} [deps.allowedTools] - Default `["Read","Glob","Grep","Bash"]` — read-only inspection.
 * @param {string} [deps.judgeProfile] - Profile name; resolved into the system prompt via `composeProfilePrompt`.
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
  const systemPrompt = judgeProfile
    ? composeProfilePrompt(judgeProfile, {
        profilesDir: resolvedProfilesDir,
        trailer: JUDGE_SYSTEM_PROMPT,
        runtime,
      })
    : {
        type: "preset",
        preset: "claude_code",
        append: JUDGE_SYSTEM_PROMPT,
      };

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
