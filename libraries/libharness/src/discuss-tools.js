/**
 * DiscussTools — discuss-mode tool servers. The lead's surface extends the
 * base set with two discuss-only terminal tools:
 *
 * - `Recess` suspends the session with a resumption trigger.
 * - `Adjourn` ends the discussion with a verdict.
 *
 * `Conclude` is absent — discuss mode ends via Adjourn or Recess.
 *
 * `RequestForComment` is an agent-level coordination tool — available on
 * discuss agents and facilitated agents (not leads). It opens a new
 * Discussion thread for long-horizon coordination on open questions.
 *
 * In discuss mode, each agent Answer routed to the lead is captured as a
 * thread reply delivered via the bridge callback — no explicit reply tool
 * is needed on the lead surface.
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

/** System prompt for discuss-mode agent participants. L0 mechanics only per COALIGNED. */
export const DISCUSS_AGENT_SYSTEM_PROMPT =
  "You are a participant in a discussion.\n" +
  "Each question arrives as `[ask#N] <name>: <text>` in your inbox.\n" +
  "Quote N as askId on your `Answer` to route the reply correctly.\n" +
  "Your `Answer` is posted to the discussion thread as a separate reply.\n" +
  "If the task already contains a completed response with no new human input after it, `Answer` that no further action is needed.\n" +
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
      "Post a brief message directly to the discussion thread. Use when responding to a human follow-up or providing a status update while participants are working.",
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
  "Acknowledge an Ask before starting work. Posts a visible comment on the thread. Does not discharge the Ask — you still owe an Answer.";

/** Discuss-mode agent tool server. */
export function createDiscussAgentToolServer(ctx, { from }) {
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
        askId: z.number().optional().describe("The ask being acknowledged"),
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
  ]);
}

/**
 * Recess handler — ends the run with a structured pause + resumption
 * trigger; cancels any open Asks so askers see a synthetic null answer.
 * `concluded` flips true (same as Adjourn); the `recessed` verdict
 * distinguishes them, and `recessTrigger` carries the resume shape for
 * the bridge.
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
