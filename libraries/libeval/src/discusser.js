/**
 * Discusser — async, suspendable orchestration on top of a within-run
 * `OrchestrationLoop`. The lead role uses `DiscussTools` (Adjourn / Recess
 * / RequestForComment) instead of the facilitator's Conclude.
 *
 * Discuss mode is a sibling of facilitate mode, not a subset of it. The
 * within-run turn loop is shared via `OrchestrationLoop`, but the lead
 * role, tool set, system prompts, and participant naming all stay
 * mode-local.
 */

import { Writable } from "node:stream";
import { resolve } from "node:path";

import { createAgentRunner } from "./agent-runner.js";
import { composeProfilePrompt } from "./profile-prompt.js";
import { SequenceCounter } from "./sequence-counter.js";
import { createMessageBus } from "./message-bus.js";
import { createOrchestrationContext } from "./orchestration-toolkit.js";
import {
  createDiscussLeadToolServer,
  createDiscussAgentToolServer,
  DISCUSS_AGENT_SYSTEM_PROMPT,
} from "./discuss-tools.js";
import { OrchestrationLoop } from "./orchestration-loop.js";

/** System prompt appended for the lead (Chair) runner in discuss mode. */
export const DISCUSS_SYSTEM_PROMPT =
  "You lead an asynchronous discussion across multiple participants and a human channel. " +
  "Ask delivers a question to one named participant — or broadcasts when no addressee is named — and blocks until that participant answers. " +
  "Announce delivers a message with no reply obligation. " +
  "Redirect interrupts an in-progress participant with replacement instructions. " +
  "RollCall returns the participant roster. " +
  "RequestForComment posts a message to the human thread via the bridge. Every reply you want the human to see MUST go through RequestForComment — the bridge delivers only queued replies, not your text output. " +
  "Recess suspends the run with a resumption trigger (responses / elapsed / either). " +
  "Adjourn ends the discussion with a verdict ('adjourned' / 'failed') and a summary. " +
  "You MUST call RequestForComment with your response before calling Adjourn. You MUST end every run by calling Adjourn or Recess — never end a turn with only text.";

/**
 * Augment a base orchestration context with discuss-mode fields.
 * @param {object} ctx
 * @param {string|null} discussionId
 * @returns {object}
 */
export function augmentContextForDiscuss(ctx, discussionId) {
  ctx.discussionId = discussionId;
  ctx.recessed = false;
  ctx.recessTrigger = null;
  ctx.recessReason = null;
  ctx.replies = [];
  ctx.rfcCounter = 0;
  ctx.outcome = null;
  return ctx;
}

/**
 * Round-trip-safe representation of `ctx.pendingAsks` (a `Map`).
 * @param {Map<string, object>} map
 * @returns {object}
 */
export function pendingAsksToPlain(map) {
  return Object.fromEntries(map);
}

/**
 * Restore a plain object back into a `Map<string, …>`.
 * @param {object|null|undefined} plain
 * @returns {Map<string, object>}
 */
export function pendingAsksFromPlain(plain) {
  if (!plain) return new Map();
  return new Map(Object.entries(plain));
}

const devNull = new Writable({
  write(_chunk, _enc, cb) {
    cb();
  },
});

/**
 * Async orchestrator for the `discuss` mode. Composes an
 * `OrchestrationLoop` for the within-run turns but owns the discussion id,
 * the resumption trigger, and the discuss-augmented terminal summary.
 */
export class Discusser {
  /**
   * @param {object} deps
   * @param {OrchestrationLoop} deps.loop
   * @param {object} deps.ctx
   * @param {import("stream").Writable} deps.output
   * @param {string|null} [deps.discussionId]
   * @param {SequenceCounter} [deps.counter]
   * @param {object} [deps.redactor]
   */
  constructor({ loop, ctx, output, discussionId, counter, redactor }) {
    if (!loop) throw new Error("loop is required");
    if (!ctx) throw new Error("ctx is required");
    if (!output) throw new Error("output is required");
    if (!redactor) throw new Error("redactor is required");
    this.loop = loop;
    this.ctx = ctx;
    this.output = output;
    this.discussionId = discussionId ?? null;
    this.counter = counter ?? new SequenceCounter();
    this.redactor = redactor;
  }

  /**
   * Run the discussion. Emits the meta header first (when a discussion_id
   * is set), delegates the within-run loop to `OrchestrationLoop`, then
   * emits the discuss-augmented summary (overrides the loop's earlier
   * summary; trace consumers keep the last summary they see).
   *
   * @param {string} task
   * @returns {Promise<{success: boolean, verdict: string, turns: number, replies: object[], trigger: object|null}>}
   */
  async run(task) {
    this.#emitMeta();

    // The loop owns within-run turns. Its emitSummary fires once before
    // run() returns; ours replaces it as the last summary line.
    await this.loop.run(task);

    const verdict = this.ctx.verdict ?? "failed";
    const success = verdict === "adjourned" || verdict === "concluded";
    this.#emitDiscussSummary({
      success,
      verdict,
      turns: this.loop.leadTurns,
    });

    return {
      success,
      verdict,
      turns: this.loop.leadTurns,
      replies: this.ctx.replies.slice(),
      trigger: this.ctx.recessTrigger ?? null,
    };
  }

  #emitMeta() {
    if (!this.discussionId) return;
    this.output.write(
      JSON.stringify(
        this.redactor.redactValue({
          source: "orchestrator",
          seq: this.counter.next(),
          event: { type: "meta", discussion_id: this.discussionId },
        }),
      ) + "\n",
    );
  }

  #emitDiscussSummary({ success, verdict, turns }) {
    const event = {
      type: "summary",
      success,
      verdict,
      turns,
      ...(this.ctx.summary && { summary: this.ctx.summary }),
      ...(this.ctx.outcome && { outcome: this.ctx.outcome }),
      replies: this.ctx.replies,
      ...(this.ctx.recessTrigger && { trigger: this.ctx.recessTrigger }),
      ...(this.discussionId && { discussion_id: this.discussionId }),
      pending_asks: pendingAsksToPlain(this.ctx.pendingAsks),
    };
    this.output.write(
      JSON.stringify(
        this.redactor.redactValue({
          source: "orchestrator",
          seq: this.counter.next(),
          event,
        }),
      ) + "\n",
    );
  }
}

/**
 * Factory — wires the lead and agent runners with `DiscussTools`, builds
 * the `OrchestrationLoop` (with `leadName: "lead"` and discuss-mode
 * protocol tagging) and the wrapping `Discusser`.
 *
 * @param {object} deps
 * @param {string} [deps.leadProfile]
 * @param {string} [deps.leadModel]
 * @param {string} [deps.agentModel]
 * @param {Array<object>} [deps.agentConfigs]
 * @param {string|null} [deps.discussionId]
 * @param {object|null} [deps.resumeContext]
 * @param {function} deps.query
 * @param {import("stream").Writable} deps.output
 * @param {number} [deps.maxTurns]
 * @param {string} [deps.leadCwd]
 * @param {string} [deps.profilesDir]
 * @param {string} [deps.taskAmend]
 * @param {object} deps.redactor
 * @returns {Discusser}
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: factory wires N runners + resume hydration paths
export function createDiscusser({
  leadProfile,
  leadModel,
  agentModel,
  agentConfigs,
  discussionId,
  resumeContext,
  query,
  output,
  maxTurns,
  leadCwd,
  profilesDir,
  taskAmend,
  redactor,
}) {
  if (!redactor) throw new Error("redactor is required");
  const resolvedLeadCwd = resolve(leadCwd ?? ".");
  const resolvedProfilesDir =
    profilesDir ?? resolve(resolvedLeadCwd, ".claude/agents");
  const resolvedConfigs = agentConfigs ?? [];

  const ctx = augmentContextForDiscuss(
    createOrchestrationContext(),
    discussionId ?? null,
  );

  // Hydrate resume context — pendingAsks, participants, history, replies.
  // resumeContext is the entire suspend/resume contract; every mutation a
  // Recess needs to preserve must travel through it.
  if (resumeContext) {
    if (resumeContext.pendingAsks)
      ctx.pendingAsks = pendingAsksFromPlain(resumeContext.pendingAsks);
    if (Array.isArray(resumeContext.participants))
      ctx.participants = resumeContext.participants;
    if (Array.isArray(resumeContext.replies))
      ctx.replies = resumeContext.replies;
    if (typeof resumeContext.askIdCounter === "number")
      ctx.askIdCounter = resumeContext.askIdCounter;
    if (typeof resumeContext.rfcCounter === "number")
      ctx.rfcCounter = resumeContext.rfcCounter;
  }

  const messageBus = createMessageBus({
    participants: ["lead", ...resolvedConfigs.map((a) => a.name)],
  });
  ctx.messageBus = messageBus;
  if (ctx.participants.length === 0) {
    ctx.participants = [
      { name: "lead", role: "lead" },
      ...resolvedConfigs.map((a) => ({ name: a.name, role: a.role })),
    ];
  }

  const systemPromptFor = (profile, trailer) => {
    if (!trailer) throw new Error("trailer is required");
    return profile
      ? composeProfilePrompt(profile, {
          profilesDir: resolvedProfilesDir,
          trailer,
        })
      : { type: "preset", preset: "claude_code", append: trailer };
  };

  let discusser;
  const leadServer = createDiscussLeadToolServer(ctx);

  const agents = resolvedConfigs.map((config) => {
    const agentServer = createDiscussAgentToolServer(ctx, {
      from: config.name,
    });

    const agentTrailer = config.systemPromptAmend
      ? `${DISCUSS_AGENT_SYSTEM_PROMPT}\n\n${config.systemPromptAmend}`
      : DISCUSS_AGENT_SYSTEM_PROMPT;

    const runner = createAgentRunner({
      cwd: config.cwd ?? resolvedLeadCwd,
      query,
      output: devNull,
      model: agentModel ?? "claude-opus-4-7[1m]",
      maxTurns: config.maxTurns ?? 50,
      allowedTools: config.allowedTools,
      onLine: (line) => discusser.loop.emitLine(config.name, line),
      mcpServers: { orchestration: agentServer },
      settingSources: ["project"],
      systemPrompt: systemPromptFor(config.agentProfile, agentTrailer),
      redactor,
    });

    return { name: config.name, role: config.role, runner };
  });

  const defaultDisallowed = ["Agent", "Task", "TaskOutput", "TaskStop"];
  const leadRunner = createAgentRunner({
    cwd: resolvedLeadCwd,
    query,
    output: devNull,
    model: leadModel ?? "claude-opus-4-7[1m]",
    maxTurns: maxTurns ?? 40,
    allowedTools: ["Bash", "Read", "Glob", "Grep", "Write", "Edit"],
    disallowedTools: defaultDisallowed,
    onLine: (line) => discusser.loop.emitLine("lead", line),
    mcpServers: { orchestration: leadServer },
    settingSources: ["project"],
    systemPrompt: systemPromptFor(leadProfile, DISCUSS_SYSTEM_PROMPT),
    redactor,
  });

  const loop = new OrchestrationLoop({
    leadRunner,
    agents,
    messageBus,
    output,
    leadName: "lead",
    mode: "discussion",
    maxTurns: maxTurns ?? 40,
    ctx,
    taskAmend,
    redactor,
  });

  discusser = new Discusser({
    loop,
    ctx,
    output,
    discussionId: discussionId ?? null,
    redactor,
    counter: loop.counter,
  });
  return discusser;
}
