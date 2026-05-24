/**
 * OrchestrationToolkit — tool schemas, per-role tool sets, and handler
 * factories for orchestration between leads (facilitator, supervisor,
 * discuss-lead) and their participating agents.
 *
 * **Tool surface, by role:**
 *
 *   |             | Ask | Answer | Announce | RollCall | Conclude | …extras |
 *   |-------------|-----|--------|----------|----------|----------|---------|
 *   | Facilitator |  ✓  |   ✓    |    ✓     |    ✓     |    ✓     |         |
 *   | Fac. agent  |  ✓  |   ✓    |    ✓     |    ✓     |          |         |
 *   | Supervisor  |  ✓  |   ✓    |    ✓     |    ✓     |    ✓     |         |
 *   | Sup. agent  |  ✓  |   ✓    |    ✓     |    ✓     |          |         |
 *   | Discuss lead|  ✓  |   ✓    |    ✓     |    ✓     |          | RFC / Recess / Adjourn |
 *   | Discuss agt |  ✓  |   ✓    |    ✓     |    ✓     |          |         |
 *   | Judge       |     |        |          |          |    ✓     |         |
 *
 * **Ask is async.** Ask returns `{askIds:[…]}` immediately and posts the
 * question to the addressee's bus queue. The reply arrives on the asker's
 * next turn as `[answer#N] <participant>: <text>`. Pending state keys by
 * `askId` (visible in `[ask#N]` tags), so duplicate Asks to the same
 * addressee coexist without overwriting.
 *
 * **Answer's `askId` is optional.** With a matching askId, the reply
 * routes to that specific asker. Without, the handler auto-picks if
 * exactly one ask is owed to the caller, otherwise routes the message
 * as an Announce so it still reaches everyone.
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

/** Create a fresh orchestration context object. */
export function createOrchestrationContext() {
  return {
    concluded: false,
    verdict: null,
    summary: null,
    participants: [],
    messageBus: null,
    // Map<askId, {askId, askerName, addresseeName, reminded}>.
    pendingAsks: new Map(),
    askIdCounter: 0,
  };
}

// --- Handler factories ---

/** Mark the session as concluded; cancel any open Asks so askers see the synthetic null on their next turn. */
export function createConcludeHandler(ctx) {
  return async ({ verdict, summary }) => {
    concludeSession(ctx, { verdict, summary, reason: "session concluded" });
    return { content: [{ type: "text", text: "Session concluded." }] };
  };
}

/**
 * Shared terminal-tool helper. Conclude / Adjourn / Recess all set the
 * same three context fields (`concluded`, `verdict`, `summary`) and
 * cancel any in-flight Asks for the same reason: nobody will ever
 * answer them now. Mode-specific handlers (Adjourn, Recess) layer
 * extra state on top before calling this.
 */
export function concludeSession(ctx, { verdict, summary, reason }) {
  ctx.concluded = true;
  ctx.verdict = verdict;
  ctx.summary = summary;
  cancelPendingAsks(ctx, reason);
}

/** Return the list of participants and their roles. */
export function createRollCallHandler(ctx) {
  return async () => ({
    content: [{ type: "text", text: JSON.stringify(ctx.participants) }],
  });
}

function resolveAddressees(ctx, { from, to, defaultTo }) {
  const explicitTo = typeof to === "string" && to.length > 0 ? to : null;
  const effectiveTo = explicitTo ?? defaultTo ?? null;
  if (effectiveTo) return [effectiveTo];
  return ctx.participants.map((p) => p.name).filter((n) => n !== from);
}

function registerPendingAsk(ctx, { from, addressee, question }) {
  const askId = ++ctx.askIdCounter;
  ctx.pendingAsks.set(askId, {
    askId,
    askerName: from,
    addresseeName: addressee,
    reminded: false,
  });
  ctx.messageBus.ask(from, addressee, question, askId);
  return askId;
}

/**
 * Create an Ask handler. Registers a pending entry per addressee, posts
 * the ask on the bus, returns `{askIds:[…]}` immediately. The LLM uses
 * those ids to match the `[answer#N]` it sees on a later turn.
 *
 * @param {object} ctx
 * @param {object} opts
 * @param {string} opts.from
 * @param {string|undefined} opts.defaultTo - `undefined` means "broadcast
 *   to everyone else"; a participant name means "target that one when
 *   `to` is omitted."
 */
export function createAskHandler(ctx, { from, defaultTo }) {
  return async ({ question, to }) => {
    if (ctx.concluded) {
      return errorResult("Session is concluded; Ask was not delivered.");
    }
    const addressees = resolveAddressees(ctx, { from, to, defaultTo });
    if (addressees.length === 0) {
      return errorResult("No addressee for Ask.");
    }
    const askIds = addressees.map((addressee) =>
      registerPendingAsk(ctx, { from, addressee, question }),
    );
    return jsonResult({ askIds });
  };
}

/**
 * Create an Answer handler with optional askId.
 *
 * - askId provided + matches a pending entry whose addressee is the caller →
 *   route the reply to the asker's queue and clear the pending entry.
 * - askId provided but unknown or wrong addressee → `isError`. The caller
 *   tried to specify; we tell them why it didn't match.
 * - askId omitted + exactly one ask owed by the caller → auto-pick it.
 * - askId omitted + 0 or many pending → broadcast as Announce so the
 *   message still reaches every other participant.
 */
export function createAnswerHandler(ctx, { from }) {
  return async ({ askId, message }) => {
    if (typeof askId === "number") {
      return routeAnswerByAskId(ctx, { from, askId, message });
    }
    const owed = [...ctx.pendingAsks.values()].filter(
      (e) => e.addresseeName === from,
    );
    if (owed.length === 1) {
      return routeAnswerByAskId(ctx, {
        from,
        askId: owed[0].askId,
        message,
      });
    }
    ctx.messageBus.announce(from, message);
    const reason =
      owed.length === 0
        ? "no pending ask for you"
        : `${owed.length} pending asks (askId omitted is ambiguous)`;
    return textResult(`Answer routed as Announce — ${reason}.`);
  };
}

function routeAnswerByAskId(ctx, { from, askId, message }) {
  const entry = ctx.pendingAsks.get(askId);
  if (!entry) return errorResult(`No pending ask with askId=${askId}.`);
  if (entry.addresseeName !== from) {
    return errorResult(
      `Ask #${askId} is addressed to ${entry.addresseeName}, not ${from}.`,
    );
  }
  ctx.pendingAsks.delete(askId);
  ctx.messageBus.answer(from, entry.askerName, message, askId);
  return textResult("Answer delivered.");
}

/** Broadcast a message to every participant except the sender. */
export function createAnnounceHandler(ctx, { from }) {
  return async ({ message }) => {
    ctx.messageBus.announce(from, message);
    return textResult("Announcement delivered.");
  };
}

/**
 * Cancel pending Asks and route a synthetic `[no answer: <reason>]` to
 * each asker's queue so callers never deadlock on a participant ignoring
 * its inbox.
 *
 * @param {object} ctx
 * @param {string} reason - Surfaced inside `[no answer: <reason>]`.
 * @param {string} [addressee] - When set, only cancel asks owed by this
 *   addressee. Omit to cancel every pending ask.
 */
export function cancelPendingAsks(ctx, reason, addressee) {
  const text = `[no answer: ${reason}]`;
  for (const [askId, entry] of [...ctx.pendingAsks]) {
    if (addressee && entry.addresseeName !== addressee) continue;
    ctx.pendingAsks.delete(askId);
    ctx.messageBus.answer("@orchestrator", entry.askerName, text, askId);
  }
}

/** Return the list of pending Asks the named participant owes an Answer to. */
export function pendingAsksOwedBy(ctx, addressee) {
  return [...ctx.pendingAsks.values()].filter(
    (e) => e.addresseeName === addressee,
  );
}

/**
 * Inject a synthetic reminder onto the addressee's bus queue and mark
 * each owed ask as reminded. Returns true when a reminder fired.
 */
export function remindOwedAsks(ctx, addressee) {
  const owed = pendingAsksOwedBy(ctx, addressee).filter((e) => !e.reminded);
  if (owed.length === 0) return false;
  for (const entry of owed) entry.reminded = true;
  const lines = owed.map(
    (e) =>
      `You have an unanswered ask from ${e.askerName} (askId=${e.askId}). Reply with Answer(message=…, askId=${e.askId}).`,
  );
  ctx.messageBus.synthetic(addressee, lines.join("\n"));
  return true;
}

// --- Tool descriptions (shared across roles) ---

const ASK_DESC_BROADCAST =
  "Send a question to one named participant, or omit 'to' to broadcast to every other participant. Returns {askIds:[…]} immediately; the reply arrives on a later turn as `[answer#N] <from>: <text>` in your inbox.";

const ASK_DESC_TARGETED = (target) =>
  `Send a question to ${target}. Returns {askIds:[N]} immediately; the reply arrives on a later turn as \`[answer#N] ${target}: <text>\` in your inbox.`;

const ANSWER_DESC =
  "Reply to an ask addressed to you. Quote askId from the [ask#N] tag on the question; omit it and the handler auto-picks the only pending ask, or routes your message as an Announce when 0 or many are pending.";

const ANNOUNCE_DESC = "Broadcast a message with no reply expected.";

const ROLLCALL_DESC = "List all participants in the session.";

const CONCLUDE_DESC =
  "End the session with a verdict ('success' or 'failure') and a summary.";

// --- Tool builders ---

/** Helper utilities for handler return values. */
function textResult(text) {
  return { content: [{ type: "text", text }] };
}
function errorResult(text) {
  return { content: [{ type: "text", text }], isError: true };
}
function jsonResult(obj) {
  return { content: [{ type: "text", text: JSON.stringify(obj) }] };
}

/**
 * Build the four-tool base for any role (lead or participant). Differences
 * across roles live in `from` / `defaultTo` / whether broadcast is allowed.
 *
 * @param {object} ctx
 * @param {object} opts
 * @param {string} opts.from - Caller's canonical name.
 * @param {string|undefined} opts.defaultTo - Default Ask target; `undefined`
 *   means "broadcast across everyone else when `to` is omitted."
 * @param {boolean} opts.broadcast - Whether Ask accepts a `to` field at all.
 *   Leads with multiple participants set this true; supervise's
 *   single-participant roles set it false.
 */
function baseTools(ctx, { from, defaultTo, broadcast }) {
  const askSchema = broadcast
    ? { question: z.string(), to: z.string().optional() }
    : { question: z.string() };
  const askDesc = broadcast ? ASK_DESC_BROADCAST : ASK_DESC_TARGETED(defaultTo);
  return [
    tool("Ask", askDesc, askSchema, createAskHandler(ctx, { from, defaultTo })),
    tool(
      "Answer",
      ANSWER_DESC,
      { message: z.string(), askId: z.number().optional() },
      createAnswerHandler(ctx, { from }),
    ),
    tool(
      "Announce",
      ANNOUNCE_DESC,
      { message: z.string() },
      createAnnounceHandler(ctx, { from }),
    ),
    tool("RollCall", ROLLCALL_DESC, {}, createRollCallHandler(ctx)),
  ];
}

/** Conclude tool — shared by facilitator + supervisor. */
function concludeTool(ctx) {
  return tool(
    "Conclude",
    CONCLUDE_DESC,
    { verdict: z.enum(["success", "failure"]), summary: z.string() },
    createConcludeHandler(ctx),
  );
}

const orchestrationServer = (tools) =>
  createSdkMcpServer({ name: "orchestration", tools });

// --- Per-role MCP server factories ---

/** Supervisor tools: Ask + Answer + Announce + RollCall + Conclude. */
export function createSupervisorToolServer(ctx) {
  return orchestrationServer([
    ...baseTools(ctx, {
      from: "supervisor",
      defaultTo: "agent",
      broadcast: false,
    }),
    concludeTool(ctx),
  ]);
}

/** Supervised agent tools: Ask + Answer + Announce + RollCall. */
export function createSupervisedAgentToolServer(ctx) {
  return orchestrationServer(
    baseTools(ctx, {
      from: "agent",
      defaultTo: "supervisor",
      broadcast: false,
    }),
  );
}

/** Facilitator tools: Ask + Answer + Announce + RollCall + Conclude. */
export function createFacilitatorToolServer(ctx) {
  return orchestrationServer([
    ...baseTools(ctx, {
      from: "facilitator",
      defaultTo: undefined,
      broadcast: true,
    }),
    concludeTool(ctx),
  ]);
}

/** Facilitated agent tools: Ask + Answer + Announce + RollCall. */
export function createFacilitatedAgentToolServer(ctx, { from }) {
  return orchestrationServer(
    baseTools(ctx, { from, defaultTo: "facilitator", broadcast: true }),
  );
}

/**
 * Judge tools: Conclude only. The judge runs a single post-hoc session
 * with no peer participants.
 */
export function createJudgeToolServer(ctx) {
  return orchestrationServer([concludeTool(ctx)]);
}

// Re-export the building blocks discuss-tools.js needs to assemble its
// own lead tool surface (it has three extra terminal tools).
export { baseTools, orchestrationServer };
