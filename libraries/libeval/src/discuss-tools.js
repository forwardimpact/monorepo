/**
 * DiscussTools — tool servers and prompts for the `discuss` orchestration
 * mode. The lead's set is sibling to (not derived from) the facilitator's:
 * `Conclude` is absent; instead `Adjourn` (terminal verdict) and `Recess`
 * (suspend with a ResumeTrigger) end a run, and `RequestForComment` queues
 * structured replies onto the trace for the bridge to deliver after the
 * workflow run completes.
 *
 * Discuss-mode prompts and tool wiring stay in this module; nothing here
 * imports from `facilitator.js`.
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import {
  createAskHandler,
  createAnswerHandler,
  createAnnounceHandler,
  createRollCallHandler,
  createRedirectHandler,
} from "./orchestration-toolkit.js";

/** System prompt appended for discuss-mode agent runners. */
export const DISCUSS_AGENT_SYSTEM_PROMPT =
  "You participate in an asynchronous discussion. " +
  "Answer replies to an ask addressed to you. " +
  "Ask sends a question to the lead or another participant. " +
  "Announce broadcasts a message. " +
  "RollCall lists participants.";

const RESUME_TRIGGER_SCHEMA = z
  .object({
    kind: z.enum(["responses", "elapsed", "either"]),
    responses: z.number().optional(),
    elapsed: z.string().optional(),
  })
  .strict();

/**
 * Lead tools for the discusser. The discuss-mode surface is Ask / Answer /
 * Announce / Redirect / RollCall plus the discuss-only RequestForComment,
 * Recess, and Adjourn. `Conclude` is intentionally absent — discuss mode
 * ends via Adjourn or Recess, never Conclude. `RequestForComment` writes
 * a structured reply onto `ctx.replies[]`; the discusser flushes those
 * into the terminal summary event at end-of-run.
 *
 * @param {object} ctx - Orchestration context (must carry `replies` array)
 * @returns {object} MCP server config (type: "sdk")
 */
export function createDiscussLeadToolServer(ctx) {
  return createSdkMcpServer({
    name: "orchestration",
    tools: [
      tool(
        "RollCall",
        "List all participants in the session.",
        {},
        createRollCallHandler(ctx),
      ),
      tool(
        "Ask",
        "Send a question to a participant. Omit 'to' to broadcast. The reply arrives via Answer.",
        { question: z.string(), to: z.string().optional() },
        createAskHandler(ctx, { from: "lead", defaultTo: undefined }),
      ),
      tool(
        "Answer",
        "Reply to an ask addressed to you.",
        { message: z.string() },
        createAnswerHandler(ctx, { from: "lead" }),
      ),
      tool(
        "Announce",
        "Broadcast a message with no reply expected.",
        { message: z.string() },
        createAnnounceHandler(ctx, { from: "lead" }),
      ),
      tool(
        "Redirect",
        "Interrupt a participant with replacement instructions.",
        { message: z.string(), to: z.string().optional() },
        createRedirectHandler(ctx),
      ),
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
        "End the discussion with a verdict and a summary.",
        {
          verdict: z.enum(["adjourned", "failed"]),
          summary: z.string(),
          outcome: z.string().optional(),
        },
        createAdjournHandler(ctx),
      ),
    ],
  });
}

/**
 * Discuss-mode agent tools: Ask / Answer / Announce / RollCall. Surface is
 * defined here (not borrowed from facilitate mode) so the two modes stay
 * structurally independent.
 *
 * @param {object} ctx - Orchestration context
 * @param {{from: string}} opts - Agent name (canonical)
 * @returns {object} MCP server config (type: "sdk")
 */
export function createDiscussAgentToolServer(ctx, { from }) {
  return createSdkMcpServer({
    name: "orchestration",
    tools: [
      tool(
        "Ask",
        "Send a question to another participant. Omit 'to' to ask the lead.",
        { question: z.string(), to: z.string().optional() },
        createAskHandler(ctx, { from, defaultTo: "lead" }),
      ),
      tool(
        "Answer",
        "Reply to an ask addressed to you.",
        { message: z.string() },
        createAnswerHandler(ctx, { from }),
      ),
      tool(
        "Announce",
        "Broadcast a message with no reply expected.",
        { message: z.string() },
        createAnnounceHandler(ctx, { from }),
      ),
      tool(
        "RollCall",
        "List all participants in the session.",
        {},
        createRollCallHandler(ctx),
      ),
    ],
  });
}

/** Create a RequestForComment handler. Queues a reply into ctx.replies[]. */
export function createRequestForCommentHandler(ctx) {
  return async ({ channel, body, addressees }) => {
    const correlationId = `rfc_${++ctx.rfcCounter}`;
    const addresseeList =
      Array.isArray(addressees) && addressees.length > 0 ? addressees : [null];
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

/** Create a Recess handler. Marks the session as recessed with a trigger. */
export function createRecessHandler(ctx) {
  return async ({ reason, trigger }) => {
    ctx.recessed = true;
    ctx.recessTrigger = trigger;
    ctx.recessReason = reason;
    ctx.concluded = true;
    ctx.verdict = "recessed";
    ctx.summary = reason;
    return { content: [{ type: "text", text: "Recess queued." }] };
  };
}

/** Create an Adjourn handler. Marks the session as concluded with a verdict. */
export function createAdjournHandler(ctx) {
  return async ({ verdict, summary, outcome }) => {
    ctx.concluded = true;
    ctx.verdict = verdict;
    ctx.summary = summary;
    if (outcome !== undefined) ctx.outcome = outcome;
    return { content: [{ type: "text", text: "Session adjourned." }] };
  };
}
