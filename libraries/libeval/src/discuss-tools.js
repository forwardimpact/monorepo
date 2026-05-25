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
  baseTools,
  concludeSession,
  orchestrationServer,
  requestForCommentTool,
} from "./orchestration-toolkit.js";

/** System prompt for discuss-mode agent participants. L0 mechanics only per COALIGNED. */
export const DISCUSS_AGENT_SYSTEM_PROMPT =
  "You are a participant in a discussion. Each question arrives as `[ask#N] <name>: <text>` — quote N as askId on your Answer to route the reply correctly. Your Answer is posted to the discussion thread as a separate reply.\n\n" +
  "Recursion guard: if the task or question already contains a completed response and no new human input follows, Answer stating no further action is needed — do not redo completed work.";

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
  return orchestrationServer([
    ...baseTools(ctx, { from, defaultTo: "lead", broadcast: true }),
    requestForCommentTool(ctx),
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
