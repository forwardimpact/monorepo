import { sendReply } from "./teams.js";

const REDIRECT_MESSAGE =
  "To link your GitHub account, please DM this bot directly.";

/**
 * Fail-closed personal-conversation gate for the link-resume flow. The gate
 * accepts only a `"personal"` Bot Framework conversation type. Every other
 * value (`undefined`, `null`, `"groupChat"`, `"channel"`, and any future
 * channel shape) short-circuits to a static DM-redirect notice. The gate
 * writes no pending-dispatch state in that case. The identity contract for
 * bridge-originated proof needs the link token to stay confidential. Only a
 * personal conversation keeps it confidential. A multi-party conversation
 * that sees the augmented URL lets any participant race `/authorize`. That
 * participant then binds the asserted identity to their own GitHub account.
 *
 * @param {string | undefined | null} conversationType
 * @param {object} ctx
 * @param {object} adapter
 * @param {() => string} msAppId
 * @param {import("@forwardimpact/libtelemetry").Logger} logger
 * @returns {Promise<boolean>} true when the gate fired (caller short-circuits)
 */
export async function applyPersonalConversationGate(
  conversationType,
  ctx,
  adapter,
  msAppId,
  logger,
) {
  if (conversationType === "personal") return false;
  const ref = ctx.participants?.[0]?.metadata;
  if (ref) {
    await sendReply(adapter, msAppId, ref, REDIRECT_MESSAGE);
  }
  logger.info("link-resume", "non-personal conversation gate", {
    conversation_type: conversationType ?? null,
    discussion_id: ctx.discussion_id,
  });
  return true;
}
