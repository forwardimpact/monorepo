import {
  createAnswerHandler,
  createOrchestrationContext,
} from "../src/orchestration-toolkit.js";
import { MessageBus } from "../src/message-bus.js";
import { createNoopRedactor } from "../src/redaction.js";
import { createToolUseMsg } from "@forwardimpact/libmock";

/** A no-op redactor for facilitator tests that don't exercise redaction. */
export const noop = () => createNoopRedactor();

/** Build a Conclude tool-use message. */
export const concludeMsg = (summary, verdict = "success") =>
  createToolUseMsg("Conclude", { verdict, summary });

/** Build an Ask tool-use message with a unique id. */
export const askMsg = (to, question) =>
  createToolUseMsg(
    "Ask",
    { to, question },
    {
      id: `ask-${to ?? "broadcast"}-${Math.random().toString(36).slice(2, 6)}`,
    },
  );

/** Build an Answer placeholder; askId is resolved lazily by the dispatcher. */
export const answerMsgPlaceholder = () =>
  createToolUseMsg(
    "Answer",
    // askId is resolved lazily by the dispatcher closure.
    { askId: 0, message: "" },
    { id: `answer-${Math.random().toString(36).slice(2, 6)}` },
  );

/** Build an Announce tool-use message. */
export const announceMsg = (message) =>
  createToolUseMsg("Announce", { message }, { id: "announce-1" });

/** Seed an orchestration context + message bus for the given participants. */
export function seedCtx(participants) {
  const ctx = createOrchestrationContext();
  const messageBus = new MessageBus({ participants });
  ctx.messageBus = messageBus;
  ctx.participants = participants.map((name) => ({ name, role: name }));
  return { ctx, messageBus };
}

/**
 * Dispatcher that snapshots the only pending Ask addressed to `from` at
 * dispatch time and quotes its askId back to the Answer handler. Lets
 * mock scripts answer without knowing askIds ahead of time.
 */
export function answerDispatcher(ctx, from, message) {
  const handler = createAnswerHandler(ctx, { from });
  return async () => {
    const owed = [...ctx.pendingAsks.values()].find(
      (e) => e.addresseeName === from,
    );
    return handler({ askId: owed?.askId, message });
  };
}
