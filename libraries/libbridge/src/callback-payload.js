export const MAX_FIELD_LENGTH = 2000;

/**
 * Validate and sanitize the kata-dispatch callback payload. Lenient by
 * design: missing `verdict`/`summary` default to safe sentinels rather
 * than rejecting, so a host that wants to surface a degraded callback
 * can still post something useful. Returns a clean object or `null` if
 * `correlation_id` is missing.
 *
 * @param {unknown} body
 * @returns {object | null}
 */
export function validateCallbackPayload(body) {
  if (!body || typeof body !== "object") return null;
  const cid = body.correlation_id;
  if (typeof cid !== "string" || !cid) return null;

  const verdict =
    typeof body.verdict === "string"
      ? body.verdict.slice(0, MAX_FIELD_LENGTH)
      : "unknown";
  const summary =
    typeof body.summary === "string"
      ? body.summary.slice(0, MAX_FIELD_LENGTH)
      : "";
  const replies = Array.isArray(body.replies) ? body.replies : [];
  const discussionId =
    typeof body.discussion_id === "string" ? body.discussion_id : undefined;
  const trigger =
    body.trigger && typeof body.trigger === "object" ? body.trigger : undefined;
  const runUrl = typeof body.run_url === "string" ? body.run_url : undefined;

  return {
    correlation_id: cid,
    verdict,
    summary,
    replies,
    ...(discussionId && { discussion_id: discussionId }),
    ...(trigger && { trigger }),
    ...(runUrl && { run_url: runUrl }),
  };
}

/**
 * Strip trailing slashes from a base URL so callback URL composition is
 * deterministic regardless of operator input.
 * @param {string} url
 * @returns {string}
 */
export function normalizeBaseUrl(url) {
  return (url ?? "").replace(/\/+$/, "");
}

/**
 * Build a fresh `DiscussionContext` record for any channel. The host
 * service supplies a `participant` (channel-shaped) and the canonical
 * record fields (`history`, `open_rfcs`, `dispatches`, etc.) are filled
 * in here so both bridges agree on the shape.
 *
 * @param {object} args
 * @param {string} args.channel
 * @param {string} args.discussionId
 * @param {object} args.participant
 * @returns {object}
 */
export function newDiscussionContext({ channel, discussionId, participant }) {
  return {
    id: `${channel}:${discussionId}`,
    channel,
    discussion_id: discussionId,
    history: [],
    participants: [participant],
    open_rfcs: {},
    lead: "release-engineer",
    pending_callbacks: {},
    dispatches: [],
    last_active_at: Date.now(),
  };
}
