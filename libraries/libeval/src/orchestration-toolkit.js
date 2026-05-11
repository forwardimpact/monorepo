/**
 * OrchestrationToolkit — tool schemas, per-role tool sets, and handler
 * factories for orchestration between supervisors, facilitators, and agents.
 *
 * The tool surface is Ask / Answer / Announce + Redirect / Conclude / RollCall,
 * shared across facilitation and supervision. Ask registers a pending-ask in
 * the context; Answer clears it and routes the reply. The orchestrator's
 * turn-complete guard (see checkPendingAsk) holds the request-response
 * contract at the runtime instead of the prompt layer.
 *
 * Handlers communicate via a shared context object. The orchestrator reads
 * context at natural checkpoints (after resume(), after onBatch).
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

/**
 * Create a fresh orchestration context object.
 * @returns {object}
 */
export function createOrchestrationContext() {
  return {
    concluded: false,
    verdict: null,
    summary: null,
    redirect: null,
    participants: [],
    messageBus: null,
    // Map<addresseeName, {askId, askerName, question, reminded}>
    // Always keyed by an addressee name. Broadcast asks write one entry
    // per named participant, so every pending entry has a concrete
    // addressee and the match rule is uniform.
    pendingAsks: new Map(),
    askIdCounter: 0,
  };
}

// --- Handler factories ---

/** Create a handler that marks the session as concluded and records the verdict and summary. */
export function createConcludeHandler(ctx) {
  return async ({ verdict, summary }) => {
    ctx.concluded = true;
    ctx.verdict = verdict;
    ctx.summary = summary;
    return { content: [{ type: "text", text: "Session concluded." }] };
  };
}

/** Create a handler that queues a redirect to interrupt a participant with replacement instructions. */
export function createRedirectHandler(ctx) {
  return async ({ message, to }) => {
    ctx.redirect = { message, to: to ?? null };
    return { content: [{ type: "text", text: "Redirect queued." }] };
  };
}

/** Create a handler that returns the list of all session participants and their roles. */
export function createRollCallHandler(ctx) {
  return async () => {
    return {
      content: [{ type: "text", text: JSON.stringify(ctx.participants) }],
    };
  };
}

/**
 * Create an Ask handler for a given caller. Ask registers a pending-ask
 * in ctx and routes the question to the addressee via the message bus.
 *
 * @param {object} ctx
 * @param {object} opts
 * @param {string} opts.from - Canonical name of the asker.
 * @param {string|undefined} opts.defaultTo - Default addressee when the
 *   caller omits `to`. Use `undefined` to signal "broadcast across all
 *   non-asker participants" (facilitator-only).
 */
export function createAskHandler(ctx, { from, defaultTo }) {
  return async ({ question, to }) => {
    const explicitTo = typeof to === "string" && to.length > 0 ? to : null;
    const effectiveTo = explicitTo ?? defaultTo ?? null;

    const addressees = effectiveTo
      ? [effectiveTo]
      : ctx.participants.map((p) => p.name).filter((name) => name !== from);

    if (addressees.length === 0) {
      return {
        content: [{ type: "text", text: "No addressee for Ask." }],
        isError: true,
      };
    }

    for (const addressee of addressees) {
      const askId = ++ctx.askIdCounter;
      ctx.pendingAsks.set(addressee, {
        askId,
        askerName: from,
        question,
        reminded: false,
      });
      ctx.messageBus.ask(from, addressee, question, askId);
    }

    return { content: [{ type: "text", text: "Ask delivered." }] };
  };
}

/**
 * Create an Answer handler for a given caller. Answer clears the caller's
 * pending-ask entry (keyed by the caller's canonical name) and routes the
 * reply to the original asker via the message bus.
 *
 * @param {object} ctx
 * @param {object} opts
 * @param {string} opts.from - Canonical name of the answerer.
 */
export function createAnswerHandler(ctx, { from }) {
  return async ({ message }) => {
    const entry = ctx.pendingAsks.get(from);
    if (!entry) {
      return {
        content: [{ type: "text", text: "No pending ask to answer." }],
        isError: true,
      };
    }
    ctx.pendingAsks.delete(from);
    ctx.messageBus.answer(from, entry.askerName, message, entry.askId);
    return { content: [{ type: "text", text: "Answer delivered." }] };
  };
}

/**
 * Create an Announce handler. Announce broadcasts a message to every
 * participant except the sender; it never touches pendingAsks.
 *
 * @param {object} ctx
 * @param {object} opts
 * @param {string} opts.from
 */
export function createAnnounceHandler(ctx, { from }) {
  return async ({ message }) => {
    ctx.messageBus.announce(from, message);
    return { content: [{ type: "text", text: "Announcement delivered." }] };
  };
}

/**
 * Shared turn-complete guard. Consulted by Facilitator#runAgent and
 * Supervisor#runAgentTurn / #endOfTurnReview before finalising an agent's
 * turn. Returns "advance" when no pending-ask is owed by `addresseeName`;
 * "recheck" after queueing a single synthetic reminder; "advance" after
 * emitting a protocol_violation event and injecting a synthetic null
 * answer so the original asker unblocks.
 *
 * @param {object} args
 * @param {object} args.ctx
 * @param {object} args.messageBus
 * @param {string} args.addresseeName
 * @param {"facilitated"|"supervised"} args.mode
 * @param {(event: object) => void} args.emitViolation
 * @returns {"advance"|"recheck"}
 */
export function checkPendingAsk({
  ctx,
  messageBus,
  addresseeName,
  mode,
  emitViolation,
}) {
  const entry = ctx.pendingAsks.get(addresseeName);
  if (!entry) return "advance";

  if (!entry.reminded) {
    entry.reminded = true;
    messageBus.synthetic(
      addresseeName,
      `You have an unanswered ask from ${entry.askerName}. Reply via Answer.`,
    );
    return "recheck";
  }

  emitViolation({
    type: "protocol_violation",
    agent: addresseeName,
    askId: entry.askId,
    mode,
  });
  messageBus.answer(
    "@orchestrator",
    entry.askerName,
    `[no answer: ${addresseeName} did not reply to ask ${entry.askId}]`,
    entry.askId,
  );
  ctx.pendingAsks.delete(addresseeName);
  return "advance";
}

// --- Per-role MCP server factories ---

/**
 * Supervisor tools: Ask + Announce + Conclude + Redirect + RollCall.
 * @param {object} ctx - Orchestration context
 * @returns {object} MCP server config (type: "sdk")
 */
export function createSupervisorToolServer(ctx) {
  return createSdkMcpServer({
    name: "orchestration",
    tools: [
      tool(
        "Ask",
        "Send a question to the agent. The reply arrives via Answer.",
        { question: z.string() },
        createAskHandler(ctx, { from: "supervisor", defaultTo: "agent" }),
      ),
      tool(
        "Announce",
        "Broadcast a message with no reply expected.",
        { message: z.string() },
        createAnnounceHandler(ctx, { from: "supervisor" }),
      ),
      tool(
        "Conclude",
        "End the session with a verdict and a summary. verdict='success' if the agent's work meets the criteria stated in the task; 'failure' otherwise.",
        { verdict: z.enum(["success", "failure"]), summary: z.string() },
        createConcludeHandler(ctx),
      ),
      tool(
        "Redirect",
        "Interrupt the agent with replacement instructions.",
        { message: z.string(), to: z.string().optional() },
        createRedirectHandler(ctx),
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

/**
 * Supervised agent tools: Ask + Answer + Announce + RollCall.
 * @param {object} ctx - Orchestration context
 * @returns {object} MCP server config (type: "sdk")
 */
export function createSupervisedAgentToolServer(ctx) {
  return createSdkMcpServer({
    name: "orchestration",
    tools: [
      tool(
        "Ask",
        "Send a question to the supervisor. The reply arrives via Answer.",
        { question: z.string() },
        createAskHandler(ctx, { from: "agent", defaultTo: "supervisor" }),
      ),
      tool(
        "Answer",
        "Reply to an ask addressed to you.",
        { message: z.string() },
        createAnswerHandler(ctx, { from: "agent" }),
      ),
      tool(
        "Announce",
        "Broadcast a message with no reply expected.",
        { message: z.string() },
        createAnnounceHandler(ctx, { from: "agent" }),
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

/**
 * Judge tools: Conclude only.
 *
 * The judge runs a single post-hoc session with no peer participants —
 * Ask/Answer/Announce/Redirect/RollCall are all moot. The judge inspects
 * the agent's working directory and trace via the host's read-only tools
 * and emits its verdict via Conclude.
 *
 * @param {object} ctx - Orchestration context
 * @returns {object} MCP server config (type: "sdk")
 */
export function createJudgeToolServer(ctx) {
  return createSdkMcpServer({
    name: "orchestration",
    tools: [
      tool(
        "Conclude",
        "End the session with a verdict and a summary. verdict='success' if the agent's work meets the criteria stated in the task; 'failure' otherwise.",
        { verdict: z.enum(["success", "failure"]), summary: z.string() },
        createConcludeHandler(ctx),
      ),
    ],
  });
}

/**
 * Facilitator tools: Ask + Announce + Conclude + RollCall.
 *
 * Redirect is intentionally omitted. In facilitated mode the facilitator
 * can re-Ask a participant to course-correct — Ask overwrites the pending
 * slot, giving the agent a proper round-trip path. Redirect (abort +
 * direct message) belongs in supervised mode where a single agent is
 * steered by a supervisor.
 *
 * @param {object} ctx - Orchestration context
 * @returns {object} MCP server config (type: "sdk")
 */
export function createFacilitatorToolServer(ctx) {
  return createSdkMcpServer({
    name: "orchestration",
    tools: [
      tool(
        "Ask",
        "Send a question to a participant. Omit 'to' to broadcast. The reply arrives via Answer.",
        { question: z.string(), to: z.string().optional() },
        createAskHandler(ctx, { from: "facilitator", defaultTo: undefined }),
      ),
      tool(
        "Announce",
        "Broadcast a message with no reply expected.",
        { message: z.string() },
        createAnnounceHandler(ctx, { from: "facilitator" }),
      ),
      tool(
        "Conclude",
        "End the session with a verdict and a summary. verdict='success' if the agent's work meets the criteria stated in the task; 'failure' otherwise.",
        { verdict: z.enum(["success", "failure"]), summary: z.string() },
        createConcludeHandler(ctx),
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

/**
 * Facilitated agent tools: Ask + Answer + Announce + RollCall.
 * @param {object} ctx - Orchestration context
 * @param {object} opts
 * @param {string} opts.from - Agent name (canonical, used for handler wiring)
 * @returns {object} MCP server config (type: "sdk")
 */
export function createFacilitatedAgentToolServer(ctx, { from }) {
  return createSdkMcpServer({
    name: "orchestration",
    tools: [
      tool(
        "Ask",
        "Send a question to another participant. Omit 'to' to ask the facilitator.",
        { question: z.string(), to: z.string().optional() },
        createAskHandler(ctx, { from, defaultTo: "facilitator" }),
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
