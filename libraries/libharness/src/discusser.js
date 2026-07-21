/**
 * Discusser — async, suspendable orchestration on top of a within-run
 * `OrchestrationLoop`. The lead role uses `DiscussTools` (Adjourn / Recess)
 * instead of the facilitator's Conclude.
 *
 * Discuss mode is a sibling of facilitate mode, not a subset of it. The
 * within-run turn loop is shared via `OrchestrationLoop`, but the lead
 * role, tool set, system prompts, and participant naming all stay
 * mode-local.
 *
 * Each agent Answer routed to the lead is captured as a thread reply
 * delivered via the bridge callback — no explicit reply tool is needed
 * on the lead surface.
 */

import { Writable } from "node:stream";
import { resolve } from "node:path";

import { createAgentRunner } from "./agent-runner.js";
import { InboxPoller } from "./inbox-poller.js";
import { ReplyEmitter } from "./reply-emitter.js";
import { composeSystemPrompt } from "./profile-prompt.js";
import { SequenceCounter } from "./sequence-counter.js";
import { createMessageBus } from "./message-bus.js";
import {
  advisorTool,
  createOrchestrationContext,
} from "./orchestration-toolkit.js";
import {
  createAdvisor,
  createAdvisorBudget,
  withAdvisorGuidance,
} from "./advisor.js";
import { createTranscriptRecorder } from "./transcript-recorder.js";
import {
  createDiscussLeadToolServer,
  createDiscussAgentToolServer,
  DISCUSS_AGENT_SYSTEM_PROMPT,
} from "./discuss-tools.js";
import { OrchestrationLoop } from "./orchestration-loop.js";
import { AGENT_MODEL, LEAD_MODEL } from "@forwardimpact/libutil/models";

/** System prompt for the discuss-mode lead. L0 mechanics only per JIDOKA. */
export const DISCUSS_SYSTEM_PROMPT =
  "You lead a discussion.\n" +
  "You have no tools to perform work yourself.\n" +
  "Use `RollCall` to list participants.\n" +
  "Use `Ask` to delegate work to the best-suited participant.\n" +
  "Participants are domain experts; state the task, not how to do it.\n" +
  "Each participant's `Answer` is posted to the discussion thread as a separate reply.\n" +
  "`Ask` is async and returns {askIds:[N,…]} immediately.\n" +
  "Answers arrive on your next turn as `[answer#N] <participant>: <text>` in your inbox.\n" +
  "End your turn while Asks are pending. The system resumes you when answers arrive.\n" +
  "Multiple `Ask` calls in one turn run participants in parallel.\n" +
  "Use `Acknowledge` to post a brief message directly to the discussion thread — use it to respond to human follow-ups or give status updates while participants are working.\n" +
  "End the discussion by calling `Adjourn` with a verdict and summary, or `Recess` only to wait on an external reply or duration.";

/**
 * Augment a base orchestration context with discuss-mode fields.
 * @param {object} ctx
 * @param {string|null} discussionId
 * @returns {object}
 */
export function augmentContextForDiscuss(ctx, discussionId) {
  ctx.discussionId = discussionId;
  ctx.recessTrigger = null;
  ctx.replies = [];
  ctx.rfcs = [];
  ctx.rfcCounter = 0;
  ctx.outcome = null;
  return ctx;
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
   * @param {object} deps.redactor
   * @param {string|null} [deps.discussionId]
   * @param {SequenceCounter} [deps.counter]
   */
  constructor({
    loop,
    ctx,
    output,
    discussionId,
    counter,
    redactor,
    inboxPoller,
  }) {
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
    this.inboxPoller = inboxPoller ?? null;
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
    const success = verdict === "adjourned";
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
      ...(this.ctx.rfcs?.length && { rfcs: this.ctx.rfcs }),
      ...(this.ctx.recessTrigger && { trigger: this.ctx.recessTrigger }),
      ...(this.discussionId && { discussion_id: this.discussionId }),
      lastActedSeq: this.inboxPoller?.lastActedSeq ?? -1,
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
 * Resume semantics: Recess ends the run, cancels any open Asks via
 * `cancelPendingAsks`, and emits a synthetic null answer per cancelled
 * ask so nothing dangles in the trace. The bridge later re-dispatches
 * the workflow against a fresh context; the human reads the trail of
 * events to decide what to re-ask.
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
 * @param {number} [deps.maxLeadTurns]
 * @param {string} [deps.leadCwd]
 * @param {string} [deps.profilesDir]
 * @param {string} [deps.taskAmend]
 * @param {object} deps.redactor
 * @param {string|null} [deps.callbackUrl]
 * @param {string|null} [deps.inboxUrl]
 * @param {string|null} [deps.correlationId]
 * @param {string} [deps.advisorModel] - Claude model for advisor consults; absent means no Advisor tool is offered.
 * @param {number} [deps.advisorMaxUses] - Session-wide consult budget shared by all agent participants (default 3).
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
  maxLeadTurns,
  leadCwd,
  profilesDir,
  taskAmend,
  redactor,
  callbackUrl,
  inboxUrl,
  correlationId,
  runtime,
  advisorModel,
  advisorMaxUses,
}) {
  if (!redactor) throw new Error("redactor is required");
  if (!runtime) throw new Error("runtime is required");
  const resolvedLeadCwd = resolve(leadCwd ?? ".");
  const resolvedProfilesDir =
    profilesDir ?? resolve(resolvedLeadCwd, ".claude/agents");
  const resolvedConfigs = agentConfigs ?? [];

  const ctx = augmentContextForDiscuss(
    createOrchestrationContext(),
    discussionId ?? null,
  );

  // Hydrate resume context — participants, replies, counters. `pendingAsks`
  // is intentionally not restored: Recess cancelled every in-flight Ask
  // with a synthetic null answer, so there's nothing meaningful to carry
  // forward.
  if (resumeContext) {
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

  const loopCounter = new SequenceCounter();
  const emitter = new ReplyEmitter({
    callbackUrl: callbackUrl ?? null,
    correlationId: correlationId ?? null,
    counter: loopCounter,
  });
  ctx.emitter = emitter;

  const abortController = new AbortController();
  const inboxPoller = inboxUrl
    ? new InboxPoller({
        inboxUrl,
        messageBus,
        leadName: "lead",
        signal: abortController.signal,
        runtime,
      })
    : null;

  // Intercept answers routed to the lead — each becomes a discussion reply.
  const originalAnswer = messageBus.answer.bind(messageBus);
  messageBus.answer = (from, to, text, askId) => {
    if (to === "lead" && from !== "@orchestrator") {
      const seq = emitter.emit({ kind: "reply", body: text, agent: from });
      ctx.replies.push({
        body: text,
        agent: from,
        kind: "reply",
        seq,
        ...(ctx.discussionId && { thread_id: ctx.discussionId }),
      });
    }
    originalAnswer(from, to, text, askId);
  };

  ctx.messageBus = messageBus;
  if (ctx.participants.length === 0) {
    ctx.participants = [
      { name: "lead", role: "lead" },
      ...resolvedConfigs.map((a) => ({ name: a.name, role: a.role })),
    ];
  }

  let discusser;
  const leadServer = createDiscussLeadToolServer(ctx);

  // One budget per session, shared by every agent's Advisor handler.
  const budget = advisorModel ? createAdvisorBudget(advisorMaxUses ?? 3) : null;

  const agents = resolvedConfigs.map((config) => {
    // Everything advisor-shaped is gated on advisorModel; with it unset the
    // composed prompt and tool surface are byte-identical to today's.
    const systemPrompt = composeSystemPrompt({
      role: "agent",
      profile: config.agentProfile,
      profilesDir: resolvedProfilesDir,
      trailer: DISCUSS_AGENT_SYSTEM_PROMPT,
      amend: withAdvisorGuidance(config.systemPromptAmend, budget),
      runtime,
    });

    let recorder = null;
    let extraTools;
    if (advisorModel) {
      recorder = createTranscriptRecorder({ systemPrompt, redactor });
      // Late-bound through the `let discusser` closure — the instance does
      // not exist yet when the advisor and tool are built.
      const advisor = createAdvisor({
        model: advisorModel,
        cwd: config.cwd ?? resolvedLeadCwd,
        query,
        recorder,
        redactor,
        runtime,
        onLine: (line) => discusser.loop.emitLine("advisor", line),
      });
      abortController.signal.addEventListener("abort", () => advisor.abort());
      extraTools = [
        advisorTool({
          from: config.name,
          consult: (q) => advisor.consult(q),
          emit: (e) => discusser.loop.emitOrchestratorEvent(e),
          budget,
          model: advisorModel,
        }),
      ];
    }

    const agentServer = createDiscussAgentToolServer(ctx, {
      from: config.name,
      ...(extraTools && { extraTools }),
    });

    const emitAgentLine = (line) => discusser.loop.emitLine(config.name, line);
    const runner = createAgentRunner({
      cwd: config.cwd ?? resolvedLeadCwd,
      query,
      output: devNull,
      model: agentModel ?? AGENT_MODEL,
      maxTurns: config.maxTurns ?? 50,
      allowedTools: config.allowedTools,
      onLine: recorder
        ? (line) => {
            emitAgentLine(line);
            recorder.recordMessage(line);
          }
        : emitAgentLine,
      ...(recorder && { onPrompt: (text) => recorder.recordPrompt(text) }),
      mcpServers: { orchestration: agentServer },
      settingSources: ["project"],
      systemPrompt,
      redactor,
    });

    return { name: config.name, role: config.role, runner };
  });

  const defaultDisallowed = [
    "Agent",
    "Task",
    "TaskOutput",
    "TaskStop",
    "Bash",
    "Write",
    "Edit",
  ];
  const leadRunner = createAgentRunner({
    cwd: resolvedLeadCwd,
    query,
    output: devNull,
    model: leadModel ?? LEAD_MODEL,
    maxTurns: maxTurns ?? 80,
    allowedTools: ["Read", "Glob", "Grep"],
    disallowedTools: defaultDisallowed,
    onLine: (line) => discusser.loop.emitLine("lead", line),
    mcpServers: { orchestration: leadServer },
    settingSources: ["project"],
    systemPrompt: composeSystemPrompt({
      role: "lead",
      profile: leadProfile,
      profilesDir: resolvedProfilesDir,
      trailer: DISCUSS_SYSTEM_PROMPT,
      runtime,
    }),
    redactor,
  });

  const loop = new OrchestrationLoop({
    leadRunner,
    agents,
    messageBus,
    output,
    leadName: "lead",
    mode: "discussion",
    maxLeadTurns: maxLeadTurns ?? undefined,
    ctx,
    taskAmend,
    redactor,
    inboxPoller,
    abortController,
  });
  loop.counter = loopCounter;

  discusser = new Discusser({
    loop,
    ctx,
    output,
    discussionId: discussionId ?? null,
    redactor,
    counter: loopCounter,
    inboxPoller,
  });
  return discusser;
}
