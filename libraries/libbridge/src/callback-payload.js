export const MAX_FIELD_LENGTH = 2000;
export const MAX_REPLY_COUNT = 50;

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
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: lenient validator with per-field type checks
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
  const rawReplies = Array.isArray(body.replies) ? body.replies : [];
  const replies = rawReplies.slice(0, MAX_REPLY_COUNT).map((r) => {
    if (!r || typeof r !== "object") return r;
    if (typeof r.body === "string") {
      return { ...r, body: r.body.slice(0, MAX_FIELD_LENGTH) };
    }
    return r;
  });
  const discussionId =
    typeof body.discussion_id === "string" ? body.discussion_id : undefined;
  const trigger = validateTrigger(body.trigger);
  const runUrl = typeof body.run_url === "string" ? body.run_url : undefined;

  const kind = typeof body.kind === "string" ? body.kind : "terminal";
  const seq = typeof body.seq === "number" ? body.seq : -1;
  const eventBody =
    typeof body.body === "string" ? body.body.slice(0, MAX_FIELD_LENGTH) : "";
  const agent =
    typeof body.agent === "string" ? body.agent.slice(0, MAX_FIELD_LENGTH) : "";
  const lastActedSeq =
    typeof body.last_acted_seq === "number" ? body.last_acted_seq : -1;

  return {
    correlation_id: cid,
    kind,
    seq,
    body: eventBody,
    agent,
    last_acted_seq: lastActedSeq,
    verdict,
    summary,
    replies,
    ...(discussionId && { discussion_id: discussionId }),
    ...(trigger && { trigger }),
    ...(runUrl && { run_url: runUrl }),
  };
}

const ALLOWED_TRIGGER_KINDS = new Set([
  "missing_input",
  "escalation_needed",
  "elapsed",
]);

const TRIGGER_FIELD_VALIDATORS = {
  replies: (raw) => {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  },
  elapsed: (raw) => (typeof raw === "string" ? raw : undefined),
  signal: (raw) => (typeof raw === "string" && raw ? raw : undefined),
};

/**
 * Validate and sanitize a trigger object at the payload boundary.
 * Rejects triggers with unknown `kind` values or invalid field types.
 *
 * @param {unknown} raw
 * @returns {object | undefined}
 */
function validateTrigger(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  if (typeof raw.kind !== "string" || !ALLOWED_TRIGGER_KINDS.has(raw.kind)) {
    return undefined;
  }
  const trigger = { kind: raw.kind };
  for (const [field, validate] of Object.entries(TRIGGER_FIELD_VALIDATORS)) {
    if (raw[field] === undefined) continue;
    const clean = validate(raw[field]);
    if (clean === undefined) return undefined;
    trigger[field] = clean;
  }
  return trigger;
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
    active_requester: null,
    last_posted_seq: -1,
  };
}
