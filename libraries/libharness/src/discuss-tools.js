/**
 * DiscussTools — discuss-mode tool servers. The lead's surface extends the
 * base set with two discuss-only terminal tools:
 *
 * - `Recess` suspends the session with a resumption trigger.
 * - `Adjourn` ends the discussion with a verdict.
 *
 * `Conclude` is absent. Discuss mode ends through Adjourn or Recess.
 *
 * `RequestForComment` is an agent-level coordination tool. It is available on
 * discuss agents and facilitated agents (not leads). It opens a new
 * Discussion thread for long-horizon coordination on open questions.
 *
 * In discuss mode, each agent Answer routed to the lead becomes a thread
 * reply. The bridge callback delivers that reply. The lead surface needs no
 * explicit reply tool.
 */

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import {
  ADJOURN_DESC,
  baseTools,
  concludeSession,
  orchestrationServer,
  RECESS_DESC,
  requestForCommentTool,
  requireNoPendingAsks,
  requireNoUnprocessedInbox,
} from "./orchestration-toolkit.js";

/** System prompt for discuss-mode agent participants. L0 mechanics only per JIDOKA. */
export const DISCUSS_AGENT_SYSTEM_PROMPT =
  "You are a participant in a discussion.\n" +
  "Each question arrives as `[ask#N] <name>: <text>` in your inbox.\n" +
  "Quote N as askId on your `Answer` to route the reply correctly.\n" +
  "The system posts your `Answer` to the discussion thread as a separate reply.\n" +
  "The task may already contain a completed response with no new human input after it. In that case, `Answer` that no further action is needed.\n" +
  "Do not redo completed work.";

const RESUME_TRIGGER_SCHEMA = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("missing_input"),
      replies: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("escalation_needed"),
      signal: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("elapsed"),
      elapsed: z.string().min(1),
    })
    .strict(),
]);

/** Discuss-mode lead tool server. */
export function createDiscussLeadToolServer(ctx) {
  return orchestrationServer([
    ...baseTools(ctx, { from: "lead", defaultTo: undefined, broadcast: true }),
    tool(
      "Acknowledge",
      "Post a brief message directly to the discussion thread. Use it to respond to a human follow-up. Use it to give a status update while participants work.",
      {
        message: z.string().describe("Message to post on the thread"),
      },
      async ({ message }) => {
        const seq =
          ctx.emitter?.emit({ kind: "ack", body: message, agent: "lead" }) ??
          -1;
        ctx.replies.push({
          body: message,
          agent: "lead",
          kind: "ack",
          seq,
          ...(ctx.discussionId && { thread_id: ctx.discussionId }),
        });
        return { content: [{ type: "text", text: "Posted." }] };
      },
    ),
    tool(
      "Recess",
      RECESS_DESC,
      { reason: z.string(), trigger: RESUME_TRIGGER_SCHEMA },
      createRecessHandler(ctx),
    ),
    tool(
      "Adjourn",
      ADJOURN_DESC,
      {
        verdict: z.enum(["adjourned", "failed"]),
        summary: z.string(),
        outcome: z.string().optional(),
      },
      createAdjournHandler(ctx),
    ),
  ]);
}

const ACKNOWLEDGE_DESC =
  "Acknowledge an Ask before you start work. Posts a visible comment on the thread. Does not discharge the Ask. You still owe an Answer.";

/** Discuss-mode agent tool server. */
export function createDiscussAgentToolServer(ctx, { from, extraTools = [] }) {
  return orchestrationServer([
    ...baseTools(ctx, { from, defaultTo: "lead", broadcast: true }),
    requestForCommentTool(ctx),
    tool(
      "Acknowledge",
      ACKNOWLEDGE_DESC,
      {
        message: z
          .string()
          .describe("Brief acknowledgement to post on the thread"),
        askId: z.number().optional().describe("The ask you acknowledge"),
      },
      async ({ message }) => {
        const seq =
          ctx.emitter?.emit({ kind: "ack", body: message, agent: from }) ?? -1;
        ctx.replies.push({
          body: message,
          agent: from,
          kind: "ack",
          seq,
          ...(ctx.discussionId && { thread_id: ctx.discussionId }),
        });
        return { content: [{ type: "text", text: "Acknowledged." }] };
      },
    ),
    ...extraTools,
  ]);
}

/**
 * Recess handler — ends the run with a structured pause and a resumption
 * trigger. It cancels any open Asks so askers see a synthetic null answer.
 * `concluded` flips true, the same as Adjourn. The `recessed` verdict
 * distinguishes them. `recessTrigger` carries the resume shape for the
 * bridge.
 */
export function createRecessHandler(ctx) {
  return async ({ reason, trigger }) => {
    const guard = requireNoPendingAsks(ctx) ?? requireNoUnprocessedInbox(ctx);
    if (guard) return guard;
    ctx.recessTrigger = trigger;
    concludeSession(ctx, {
      verdict: "recessed",
      summary: reason,
      reason: "session recessed",
    });
    return { content: [{ type: "text", text: "Recess queued." }] };
  };
}

/** Adjourn handler — ends the discussion with a verdict. */
export function createAdjournHandler(ctx) {
  return async ({ verdict, summary, outcome }) => {
    const guard = requireNoPendingAsks(ctx) ?? requireNoUnprocessedInbox(ctx);
    if (guard) return guard;
    if (outcome !== undefined) ctx.outcome = outcome;
    concludeSession(ctx, {
      verdict,
      summary,
      reason: "session adjourned",
    });
    return { content: [{ type: "text", text: "Session adjourned." }] };
  };
}
