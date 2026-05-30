import { bridge } from "@forwardimpact/libtype";
import { buildPrompt } from "@forwardimpact/libbridge";

import { postSingleDiscussionReply } from "./graphql.js";

/**
 * Try to inject a message into an active run's inbox, or post a static
 * notice if the requester is not the session owner.
 *
 * @returns {{ kind: "injected"|"noticed" } | null}
 */
export async function tryInject(
  ctx,
  requester,
  text,
  { client, graphqlClient, recordOrigin },
) {
  if (
    Object.keys(ctx.pending_callbacks).length === 0 ||
    !ctx.active_requester
  ) {
    return null;
  }
  if (String(requester) === String(ctx.active_requester)) {
    const correlationId = Object.values(ctx.pending_callbacks)[0];
    await client.EnqueueInbox(
      bridge.EnqueueInboxRequest.fromObject({
        message: {
          correlation_id: correlationId,
          text,
          author: String(requester),
          enqueued_at: Date.now(),
        },
      }),
    );
    ctx.last_active_at = Date.now();
    return { kind: "injected" };
  }
  await postSingleDiscussionReply(
    graphqlClient,
    ctx,
    "A session is in progress on this thread. Your message was not forwarded to the active run.",
    recordOrigin,
  );
  return { kind: "noticed" };
}

/**
 * After a terminal verdict, drain unconsumed inbox messages and
 * re-dispatch if any remain unprocessed.
 */
export async function reconcileInbox(
  ctx,
  meta,
  payload,
  { client, dispatcher },
) {
  const lastActed = payload.last_acted_seq ?? -1;
  const remaining = await client.DrainInbox(
    bridge.DrainInboxRequest.fromObject({
      correlation_id: meta.correlationId,
      since_seq: lastActed,
    }),
  );
  if (remaining.messages?.length > 0) {
    const coalesced = remaining.messages.map((m) => m.text).join("\n\n");
    await dispatcher.dispatch({
      ctx,
      prompt: buildPrompt(coalesced, ctx.history),
      requester: remaining.messages[0].author,
      ackTarget: { subjectId: ctx.discussion_id },
      callbackMeta: { discussionId: ctx.discussion_id },
      workflowInputs: { discussionId: ctx.discussion_id },
    });
  }
}
