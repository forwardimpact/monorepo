/**
 * DiscussTools — discuss-mode tool servers. The lead's surface extends the
 * base set with three discuss-only terminal tools:
 *
 * - `RequestForComment` posts a fire-and-forget message to a human channel
 *   via the bridge; the reply arrives on a later workflow run.
 * - `Recess` suspends the session with a resumption trigger.
 * - `Adjourn` ends the discussion with a verdict.
 *
 * `Conclude` is absent — discuss mode ends via Adjourn or Recess. The
 * agent surface is identical to the facilitated agent's: Ask / Answer /
 * Announce / RollCall, with Ask defaulting to the lead.
 */

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import {
  baseTools,
  concludeSession,
  orchestrationServer,
} from "./orchestration-toolkit.js";

/** System prompt appended for discuss-mode agent runners. */
export const DISCUSS_AGENT_SYSTEM_PROMPT =
  "You participate in an asynchronous discussion. " +
  "Each question you receive carries an [ask#N] header — quote that N back as the askId field on Answer so the reply pairs with the right question. " +
  "Answer replies to an ask addressed to you. askId is optional: omit it and the handler auto-picks if exactly one ask is owed to you, otherwise it routes your message as an Announce. " +
  "Ask sends a question to the lead or another participant and returns immediately with {askIds:[N]}; the reply arrives on a later turn as `[answer#N] <participant>: <text>` in your inbox. " +
  "Announce broadcasts a message to every other participant — use this for unsolicited remarks or to reply to an Announce. " +
  "RollCall lists participants.";

const RESUME_TRIGGER_SCHEMA = z
  .object({
    kind: z.enum(["responses", "elapsed", "either"]),
    responses: z.number().optional(),
    elapsed: z.string().optional(),
  })
  .strict();

/** Discuss-mode lead tool server. */
export function createDiscussLeadToolServer(ctx) {
  return orchestrationServer([
    ...baseTools(ctx, { from: "lead", defaultTo: undefined, broadcast: true }),
    tool(
      "RequestForComment",
      "Post a fire-and-forget message to a channel via the bridge. Returns a correlation id; the reply arrives on a later workflow run.",
      {
        channel: z.string(),
        body: z.string(),
        addressees: z.array(z.string()).optional(),
      },
      createRequestForCommentHandler(ctx),
    ),
    tool(
      "Recess",
      "Suspend the run. The bridge re-dispatches the workflow when the trigger fires.",
      { reason: z.string(), trigger: RESUME_TRIGGER_SCHEMA },
      createRecessHandler(ctx),
    ),
    tool(
      "Adjourn",
      "End the discussion with a verdict ('adjourned' / 'failed') and a summary.",
      {
        verdict: z.enum(["adjourned", "failed"]),
        summary: z.string(),
        outcome: z.string().optional(),
      },
      createAdjournHandler(ctx),
    ),
  ]);
}

/** Discuss-mode agent tool server. */
export function createDiscussAgentToolServer(ctx, { from }) {
  return orchestrationServer(
    baseTools(ctx, { from, defaultTo: "lead", broadcast: true }),
  );
}

/** RequestForComment handler — queues structured replies on `ctx.replies[]`. */
export function createRequestForCommentHandler(ctx) {
  return async ({ channel, body, addressees }) => {
    const correlationId = `rfc_${++ctx.rfcCounter}`;
    const addresseeList = addressees?.length ? addressees : [null];
    for (const addressee of addresseeList) {
      ctx.replies.push({
        ...(addressee && { addressee }),
        body,
        ...(ctx.discussionId && { thread_id: ctx.discussionId }),
        correlation_id: correlationId,
      });
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ correlation_id: correlationId, channel }),
        },
      ],
    };
  };
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
    if (outcome !== undefined) ctx.outcome = outcome;
    concludeSession(ctx, {
      verdict,
      summary,
      reason: "session adjourned",
    });
    return { content: [{ type: "text", text: "Session adjourned." }] };
  };
}
