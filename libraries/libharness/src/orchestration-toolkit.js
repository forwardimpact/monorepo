/**
 * OrchestrationToolkit — tool schemas, per-role tool sets, and handler
 * factories for orchestration between leads (facilitator, supervisor,
 * discuss-lead) and the agents that take part.
 *
 * **Tool surface, by role:**
 *
 *   |             | Ask | Answer | Announce | RollCall | Conclude | …extras              |
 *   |-------------|-----|--------|----------|----------|----------|-----------------------|
 *   | Facilitator |  ✓  |   ✓    |    ✓     |    ✓     |    ✓     |                       |
 *   | Fac. agent  |  ✓  |   ✓    |    ✓     |    ✓     |          | RFC                   |
 *   | Supervisor  |  ✓  |   ✓    |    ✓     |    ✓     |    ✓     |                       |
 *   | Sup. agent  |  ✓  |   ✓    |    ✓     |    ✓     |          |                       |
 *   | Discuss lead|  ✓  |   ✓    |    ✓     |    ✓     |          | Recess / Adjourn      |
 *   | Discuss agt |  ✓  |   ✓    |    ✓     |    ✓     |          | RFC                   |
 *   | Judge       |     |        |          |          |    ✓     |                       |
 *
 * **Ask is async.** Ask returns `{askIds:[…]}` immediately. It posts the
 * question to the addressee's bus queue. The reply arrives on the asker's
 * next turn as `[answer#N] <participant>: <text>`. The toolkit keys pending
 * state by `askId` (visible in `[ask#N]` tags). Duplicate Asks to the same
 * addressee then coexist and never overwrite each other.
 *
 * **Answer's `askId` is optional.** With a matching askId, the reply
 * routes to that specific asker. Without one, the handler auto-picks when
 * exactly one ask is owed to the caller. If not, the handler routes the
 * message as an Announce so it still reaches everyone.
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

/**
 * Guard for terminal tools (`Conclude`, `Adjourn`, `Recess`). Returns an
 * error result when the caller still has Asks in flight. That result tells
 * the caller to end the turn and wait for the auto-resume. Returns `null`
 * when no Asks are pending and the terminal tool is free to run.
 */
export function requireNoPendingAsks(ctx) {
  if (ctx.pendingAsks.size === 0) return null;
  return errorResult(
    "Asks are still pending. End your turn. You will be resumed when answers arrive.",
  );
}

/**
 * Guard for terminal tools in discuss mode (`Adjourn`, `Recess`). Returns
 * an error result when the lead's inbox has unprocessed messages from the
 * human. That result tells the lead to end the turn and wait for the
 * auto-resume. Returns `null` when no inbox messages are pending and the
 * terminal tool is free to run.
 */
export function requireNoUnprocessedInbox(ctx) {
  if (!ctx.messageBus?.hasPending?.("lead")) return null;
  return errorResult(
    "New messages from the human are in your inbox. End your turn. You will be resumed to process them.",
  );
}

/** Mark the session as concluded. Cancel any open Asks so askers see the synthetic null on their next turn. */
export function createConcludeHandler(ctx) {
  return async ({ verdict, summary }) => {
    const guard = requireNoPendingAsks(ctx);
    if (guard) return guard;
    concludeSession(ctx, { verdict, summary, reason: "session concluded" });
    return { content: [{ type: "text", text: "Session concluded." }] };
  };
}

/**
 * Shared terminal-tool helper. Conclude, Adjourn, and Recess all set the
 * same three context fields (`concluded`, `verdict`, `summary`). All three
 * also cancel any in-flight Asks for the same reason. Nobody will ever
 * answer them now. Mode-specific handlers (Adjourn, Recess) layer extra
 * state on top before they call this.
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
 * Create an Ask handler. The handler registers a pending entry for each
 * addressee. It posts the ask on the bus. It returns `{askIds:[…]}`
 * immediately. The LLM uses those ids to match the `[answer#N]` it sees on
 * a later turn.
 *
 * @param {object} ctx
 * @param {object} opts
 * @param {string} opts.from
 * @param {string|undefined} opts.defaultTo - `undefined` means "broadcast
 *   to everyone else". A participant name means "target that one when
 *   `to` is omitted."
 */
export function createAskHandler(ctx, { from, defaultTo }) {
  return async ({ question, to }) => {
    if (ctx.concluded) {
      return errorResult(
        "The session is concluded. The handler did not deliver your Ask.",
      );
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
 *   tried to name an askId. The handler tells the caller why it did not
 *   match.
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
        ? "You have no pending ask."
        : `You have ${owed.length} pending asks. An omitted askId is ambiguous.`;
    return textResult(`Answer routed as Announce. ${reason}`);
  };
}

function routeAnswerByAskId(ctx, { from, askId, message }) {
  const entry = ctx.pendingAsks.get(askId);
  if (!entry) return errorResult(`No pending ask with askId=${askId}.`);
  if (entry.addresseeName !== from) {
    return errorResult(
      `Ask #${askId} is addressed to ${entry.addresseeName}. You are ${from}.`,
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
 * Cancel pending Asks. Route a synthetic `[no answer: <reason>]` to each
 * asker's queue, so callers never deadlock when a participant ignores its
 * inbox.
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
 * Inject a synthetic reminder onto the addressee's bus queue. Mark each
 * owed ask as reminded. Returns true when a reminder fired.
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
  "Send a question to one named participant. Omit 'to' to broadcast to every other participant. Returns {askIds:[…]} immediately. The reply arrives on a later turn as `[answer#N] <from>: <text>` in your inbox.";

const ASK_DESC_TARGETED = (target) =>
  `Send a question to ${target}. Returns {askIds:[N]} immediately. The reply arrives on a later turn as \`[answer#N] ${target}: <text>\` in your inbox.`;

const ANSWER_DESC =
  "Reply to an ask addressed to you. Quote askId from the [ask#N] tag on the question. Omit askId and the handler auto-picks the only pending ask. When 0 or many asks are pending, the handler routes your message as an Announce.";

const ANNOUNCE_DESC = "Broadcast a message with no reply expected.";

const ROLLCALL_DESC = "List all participants in the session.";

// Terminal-tool descriptions. Each one ends the run. Group them so the
// contrast is visible: Conclude (success/failure), Adjourn (settled in
// thread), Recess (paused for out-of-session input). Each description
// leads with the cost.
const CONCLUDE_DESC =
  "End the session. Provide a verdict ('success' or 'failure') and a summary.";

const ADJOURN_DESC =
  "End the discussion. Provide a verdict ('adjourned' or 'failed') and a summary. Cancels any unanswered Asks.";

const RECESS_DESC =
  "End the run. Schedule an out-of-session re-dispatch. Cancels any unanswered Asks. Use only when you wait on an external reply or duration. Do not use to wait on in-flight Asks.";

// --- Tool builders ---

/** Helper utilities for handler return values. */
function textResult(text) {
  return { content: [{ type: "text", text }] };
}
/** Build an MCP tool error result that wraps a single text message. */
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
 * @param {string|undefined} opts.defaultTo - Default Ask target. `undefined`
 *   means "broadcast across everyone else when `to` is omitted."
 * @param {boolean} opts.broadcast - Whether Ask accepts a `to` field at all.
 *   Leads with multiple participants set this true. Supervise's
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

const ADVISOR_DESC =
  "Consult a stronger model on one focused question. The tool forwards your full session context (system prompt, prompts, transcript so far) automatically. You cannot restrict it. The advice returns in the tool result. All participants share one session-wide consult budget.";

/**
 * Build the `Advisor` consult tool for one caller. The tool is
 * mode-agnostic. Loop modes pass it into the agent tool-server factories
 * through `extraTools`. Run mode gives it a dedicated server. The tool has
 * no orchestration-context dependency. The budget object and the emit
 * callback arrive as injected dependencies.
 *
 * @param {object} deps
 * @param {string} deps.from - Caller's canonical name (event attribution).
 * @param {(question: string) => Promise<{advice?: string, unavailable?: boolean, reason?: string, durationMs: number}>} deps.consult
 * @param {(event: object) => void} deps.emit - Orchestrator-event emitter for the `advisor_consult` event.
 * @param {{maxUses: number, used: number}} deps.budget - Session-wide budget that every caller's handler shares.
 * @param {string} deps.model - Advisor model id, carried on the consult event.
 */
export function advisorTool({ from, consult, emit, budget, model }) {
  return tool(
    "Advisor",
    ADVISOR_DESC,
    { question: z.string() },
    async ({ question }) => {
      if (budget.used >= budget.maxUses) {
        return textResult(
          `Consult limit reached (${budget.maxUses}/${budget.maxUses} used) — proceed with your best judgment.`,
        );
      }
      // Increment before the first await so two concurrent callers cannot
      // both pass a last-slot check.
      budget.used++;
      const r = await consult(question);
      const remaining = budget.maxUses - budget.used;
      emit({
        type: "advisor_consult",
        caller: from,
        question,
        model,
        durationMs: r.durationMs,
        remaining,
      });
      if (r.unavailable) {
        // Not isError. This fails open, so the caller continues normally.
        return textResult(
          `The advisor is unavailable (${r.reason}) — proceed with your best judgment.`,
        );
      }
      return textResult(
        `${r.advice}\n\n[advisor consults remaining: ${remaining}]`,
      );
    },
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

/** Supervised agent tools: Ask + Answer + Announce + RollCall (+ extras). */
export function createSupervisedAgentToolServer(ctx, { extraTools = [] } = {}) {
  return orchestrationServer([
    ...baseTools(ctx, {
      from: "agent",
      defaultTo: "supervisor",
      broadcast: false,
    }),
    ...extraTools,
  ]);
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

/** Facilitated agent tools: Ask + Answer + Announce + RollCall + RequestForComment (+ extras). */
export function createFacilitatedAgentToolServer(
  ctx,
  { from, extraTools = [] },
) {
  return orchestrationServer([
    ...baseTools(ctx, { from, defaultTo: "facilitator", broadcast: true }),
    requestForCommentTool(ctx),
    ...extraTools,
  ]);
}

/**
 * Judge tools: Conclude only. The judge runs a single post-hoc session
 * with no peer participants.
 */
export function createJudgeToolServer(ctx) {
  return orchestrationServer([concludeTool(ctx)]);
}

// --- RequestForComment (agent-level coordination tool) ---

/** RequestForComment handler — queues RFC intent on `ctx.rfcs[]`. */
export function createRequestForCommentHandler(ctx) {
  return async ({ channel, body, addressees }) => {
    if (!ctx.rfcs) ctx.rfcs = [];
    if (typeof ctx.rfcCounter !== "number") ctx.rfcCounter = 0;
    const correlationId = `rfc_${++ctx.rfcCounter}`;
    const addresseeList = addressees?.length ? addressees : [null];
    for (const addressee of addresseeList) {
      ctx.rfcs.push({
        ...(addressee && { addressee }),
        body,
        channel,
        ...(ctx.discussionId && { thread_id: ctx.discussionId }),
        correlation_id: correlationId,
      });
    }
    return jsonResult({ correlation_id: correlationId, channel });
  };
}

/** Build the RequestForComment tool definition. */
function requestForCommentTool(ctx) {
  return tool(
    "RequestForComment",
    "Open a new Discussion thread for long-horizon coordination on an open question. The bridge creates the thread. Replies arrive asynchronously on future runs.",
    {
      channel: z.string(),
      body: z.string(),
      addressees: z.array(z.string()).optional(),
    },
    createRequestForCommentHandler(ctx),
  );
}

// Re-export the parts discuss-tools.js needs to assemble its own lead tool
// surface (it has two extra terminal tools).
export {
  ADJOURN_DESC,
  baseTools,
  errorResult,
  orchestrationServer,
  RECESS_DESC,
  requestForCommentTool,
};
