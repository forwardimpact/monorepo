const MAX_FIELD_LENGTH = 2000;

/**
 * Validate and sanitize the kata-dispatch callback payload. Returns a clean
 * object or null. Accepts the channel-agnostic optional fields (`replies`,
 * `trigger`, `discussion_id`) used by the discuss-mode trace.
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
 * @param {string} url
 * @returns {string}
 */
export function normalizeBaseUrl(url) {
  return (url ?? "").replace(/\/+$/, "");
}

/**
 * Build a fresh `DiscussionContext` record for the github-discussions channel.
 * Mirrors the canonical record shape declared in `libbridge`.
 *
 * @param {string} discussionId
 * @param {object} discussion - The GitHub webhook payload's discussion object
 * @returns {object}
 */
export function newDiscussionContext(discussionId, discussion) {
  return {
    id: `github-discussions:${discussionId}`,
    channel: "github-discussions",
    discussion_id: discussionId,
    history: [],
    participants: [
      {
        name: discussion?.user?.login ?? "github-user",
        kind: "human",
        external_id: discussion?.user?.id?.toString(),
        metadata: { node_id: discussion?.node_id },
      },
    ],
    open_rfcs: {},
    lead: "release-engineer",
    pending_callbacks: {},
    dispatches: [],
    last_active_at: Date.now(),
  };
}
