/**
 * DiscussTools — tool servers for the `discuss` orchestration mode. The
 * lead's set replaces `Conclude` with `Adjourn` (terminal verdict) and
 * `Recess` (suspend with a ResumeTrigger), and adds `RequestForComment`
 * which queues structured replies onto the trace for the bridge to
 * deliver after the workflow run completes.
 *
 * Agents in discuss mode reuse the facilitated-agent surface unchanged.
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

const RESUME_TRIGGER_SCHEMA = z
  .object({
    kind: z.enum(["responses", "elapsed", "either"]),
    responses: z.number().optional(),
    elapsed: z.string().optional(),
  })
  .strict();

/**
 * Lead tools for the discusser. Mirrors the facilitator surface plus
 * Redirect, RequestForComment, Recess, and Adjourn; intentionally omits
 * Conclude. `RequestForComment` writes a structured reply onto
 * `ctx.replies[]`; the discusser flushes those into the terminal summary
 * event at end-of-run.
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
        createAskHandler(ctx, { from: "facilitator", defaultTo: undefined }),
      ),
      tool(
        "Answer",
        "Reply to an ask addressed to you.",
        { message: z.string() },
        createAnswerHandler(ctx, { from: "facilitator" }),
      ),
      tool(
        "Announce",
        "Broadcast a message with no reply expected.",
        { message: z.string() },
        createAnnounceHandler(ctx, { from: "facilitator" }),
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
 * Discussed-agent tools — same surface as facilitated agents.
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
