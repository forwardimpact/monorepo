import { sendReply } from "./teams.js";

const REDIRECT_MESSAGE =
  "To link your GitHub account, please DM this bot directly.";

/**
 * Fail-closed personal-conversation gate for the link-resume flow. Anything
 * other than a `"personal"` Bot Framework conversation type (including
 * `undefined`, `null`, `"groupChat"`, `"channel"`, and any future channel
 * shape) short-circuits to a static DM-redirect notice without writing
 * pending-dispatch state. The bridge-originated-proof identity contract
 * requires link-token confidentiality, which only personal conversations
 * provide; a multi-party conversation that sees the augmented URL lets any
 * participant race `/authorize` and bind the asserted identity to their
 * own GitHub account.
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
