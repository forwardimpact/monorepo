import { createHmac, timingSafeEqual } from "node:crypto";

import { isTrusted } from "./trusted-origins.js";

/** Ticket lifetime in milliseconds. 5 minutes covers IdP round-trip + redirect
 * with margin and is well inside browser/proxy URL-lifetime norms. */
export const TICKET_TTL_MS = 5 * 60 * 1000;

/**
 * Canonical-JSON encoding of the ticket payload. Keys are sorted alphabetically
 * (`exp, idp_origin, link_token, surface_user_id`) so the wire bytes do not
 * depend on input-object property iteration order — minting the same claims
 * twice produces byte-identical payloads.
 *
 * @param {object} claims
 * @param {number} claims.exp Absolute ms-since-epoch expiry.
 * @param {string} claims.idpOrigin Normalised IdP origin (`new URL(…).origin`).
 * @param {string} claims.linkToken Opaque link-token claim.
 * @param {string} claims.surfaceUserId Caller surface user id.
 * @returns {string} Canonical JSON.
 */
function canonicalJson({ exp, idpOrigin, linkToken, surfaceUserId }) {
  return JSON.stringify({
    exp,
    idp_origin: idpOrigin,
    link_token: linkToken,
    surface_user_id: surfaceUserId,
  });
}

function b64urlEncode(bufOrStr) {
  const buf =
    typeof bufOrStr === "string" ? Buffer.from(bufOrStr, "utf8") : bufOrStr;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlDecodeToBuffer(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(secret, payloadB64) {
  return createHmac("sha256", secret).update(payloadB64).digest();
}

/**
 * Mint a completion ticket for the bridge to verify after the IdP round-trip.
 * Wire form: `<base64url(canonicalJson)>.<base64url(hmacSha256(secret, payload))>`.
 *
 * @param {object} args
 * @param {string} args.linkToken Opaque link-token bound to a queued dispatch.
 * @param {string} args.surfaceUserId Caller surface user id.
 * @param {string} args.idpOrigin Normalised IdP origin (`new URL(…).origin`).
 * @param {string} args.secret Shared HMAC secret. Must match the verifier's.
 * @param {number} args.now Absolute ms-since-epoch.
 * @returns {string} Wire-form ticket.
 */
export function mintCompletionTicket({
  linkToken,
  surfaceUserId,
  idpOrigin,
  secret,
  now,
}) {
  const exp = now + TICKET_TTL_MS;
  const payloadJson = canonicalJson({ exp, idpOrigin, linkToken, surfaceUserId });
  const payloadB64 = b64urlEncode(payloadJson);
  const sig = sign(secret, payloadB64);
  return `${payloadB64}.${b64urlEncode(sig)}`;
}

/**
 * Verify a wire-form completion ticket. Returns `{ ok: true, claims }` on
 * success or `{ ok: false, reason }` on failure. All failure reasons are
 * caller-rendered as the same "Unable to verify completion" page —
 * indistinguishability is intentional.
 *
 * Failure reasons: `malformed`, `bad_signature`, `expired`,
 * `link_token_mismatch`, `untrusted_origin`.
 *
 * The `surface_user_id` claim is returned in `claims.surfaceUserId` for the
 * handler to cross-check against the freshly-resolved `pending.surface_user_id`
 * — see `services/bridge` step 8 in the plan. Folding that check into the
 * verifier would require it to take a pending store, which the design
 * explicitly avoids.
 *
 * @param {object} args
 * @param {string} args.ticket Wire-form ticket.
 * @param {{linkToken: string}} args.expected Link-token the handler resolved.
 * @param {Set<string>} args.trustedOrigins Trusted-origin set from libutil.
 * @param {string} args.secret Shared HMAC secret.
 * @param {number} args.now Absolute ms-since-epoch.
 * @returns {{ok: true, claims: {linkToken: string, surfaceUserId: string, idpOrigin: string, exp: number}} | {ok: false, reason: string}}
 */
export function verifyCompletionTicket({
  ticket,
  expected,
  trustedOrigins,
  secret,
  now,
}) {
  if (typeof ticket !== "string" || !ticket.includes(".")) {
    return { ok: false, reason: "malformed" };
  }
  const dot = ticket.indexOf(".");
  if (dot === 0 || dot === ticket.length - 1) {
    return { ok: false, reason: "malformed" };
  }
  const payloadB64 = ticket.slice(0, dot);
  const sigB64 = ticket.slice(dot + 1);

  const presentedSig = b64urlDecodeToBuffer(sigB64);
  const expectedSig = sign(secret, payloadB64);
  if (
    presentedSig.length !== expectedSig.length ||
    !timingSafeEqual(presentedSig, expectedSig)
  ) {
    return { ok: false, reason: "bad_signature" };
  }

  let claims;
  try {
    claims = JSON.parse(b64urlDecodeToBuffer(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const { exp, idp_origin, link_token, surface_user_id } = claims;
  if (
    typeof exp !== "number" ||
    typeof idp_origin !== "string" ||
    typeof link_token !== "string" ||
    typeof surface_user_id !== "string"
  ) {
    return { ok: false, reason: "malformed" };
  }

  if (now >= exp) return { ok: false, reason: "expired" };
  if (link_token !== expected.linkToken) {
    return { ok: false, reason: "link_token_mismatch" };
  }
  if (!isTrusted(idp_origin, trustedOrigins)) {
    return { ok: false, reason: "untrusted_origin" };
  }
  return {
    ok: true,
    claims: {
      linkToken: link_token,
      surfaceUserId: surface_user_id,
      idpOrigin: idp_origin,
      exp,
    },
  };
}
