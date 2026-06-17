import { randomUUID } from "node:crypto";
import { isTrusted } from "@forwardimpact/libutil/trusted-origins";
import { verifyCompletionTicket } from "@forwardimpact/libutil/completion-ticket";
import { normalizeBaseUrl } from "./callback-payload.js";
import { buildPrompt } from "./prompt.js";

/**
 * Prepare a link-resume URL for the IdP authorize step.
 *
 * Discriminated return so a missing `catch` cannot become a 5xx oracle in
 * the caller. The keyword-arg shape makes "forgot to pass trustedOrigins"
 * a loud boot-time `TypeError` for any future xbridge.
 *
 * @param {object} args
 * @param {string} args.authorizeUrl Upstream IdP authorize URL the bridge
 *   intends to post into the channel.
 * @param {string} args.callbackBaseUrl Bridge's own callback base URL; the
 *   per-bridge `/api/link-complete` is composed from this.
 * @param {Set<string>} args.trustedOrigins Trusted-origin set produced by
 *   `loadTrustedIdpOrigins`. Required — a missing or non-Set value throws.
 * @param {string} [args.tenantId] Resolved tenant the dispatch is scoped to.
 *   When present, set as the `tenant_id` query param so the authorize round
 *   trip carries it to `ghuser` `Begin` → `VerifyPendingDispatch`, matching
 *   the `PutPendingDispatch` write key by construction. Absent leaves the URL
 *   unchanged.
 * @returns {{linkToken: string, augmentedUrl: string} | {skipped: true, reason: string}}
 *   On a trusted, parseable URL: `{ linkToken, augmentedUrl }`. On any
 *   refusal: `{ skipped: true, reason: "untrusted_origin" }`.
 */
export function prepareLinkResume({
  authorizeUrl,
  callbackBaseUrl,
  trustedOrigins,
  tenantId,
}) {
  if (!(trustedOrigins instanceof Set))
    throw new TypeError("prepareLinkResume: trustedOrigins must be a Set");
  let originUrl;
  try {
    originUrl = new URL(authorizeUrl);
  } catch {
    return { skipped: true, reason: "untrusted_origin" };
  }
  if (!isTrusted(originUrl.origin, trustedOrigins))
    return { skipped: true, reason: "untrusted_origin" };

  const linkToken = randomUUID();
  originUrl.searchParams.set(
    "redirect_uri",
    `${normalizeBaseUrl(callbackBaseUrl)}/api/link-complete`,
  );
  originUrl.searchParams.set("client_state", linkToken);
  if (tenantId) originUrl.searchParams.set("tenant_id", tenantId);
  return { linkToken, augmentedUrl: originUrl.toString() };
}

const UNABLE_TO_VERIFY_HTML =
  "<!DOCTYPE html><html><body><h1>Unable to verify completion</h1>" +
  "<p>The completion request could not be verified. Please try " +
  "linking again from the conversation.</p></body></html>";

/**
 * Factory for the `/api/link-complete` GET handler.
 *
 * Handler ordering: the ticket is verified **before** any store touch —
 * an attacker without a valid ticket exits at the verify step and never
 * sees a present-vs-absent timing oracle on `linkToken`.
 *
 * The `surface_user_id` cross-check is performed **server-side** by passing
 * `verify.claims.surfaceUserId` as `expectedSurfaceUserId` to
 * `store.resolvePendingDispatch`. The bridge refuses to consume the entry
 * on mismatch — so an attacker who minted a valid ticket against the
 * victim's `link_token` (e.g. by driving the IdP round-trip under their
 * own account with `client_state=victim_link_token`) cannot drain the
 * auto-resume affordance: the bridge returns `{ unattributable: true }`
 * and the entry stays available for the legitimate user.
 *
 * @param {object} options
 * @param {string} options.channel Channel id (e.g. `"github-discussions"`).
 * @param {object} options.store
 * @param {object} options.dispatcher
 * @param {(ctx: object) => object} options.buildCallbackMeta
 * @param {Set<string>} options.trustedOrigins Required.
 * @param {string} options.ticketSecret Required.
 * @param {{now: () => number}} options.clock Required.
 * @returns {(c: import("hono").Context) => Promise<Response>}
 */
export function createLinkCompleteHandler({
  channel,
  store,
  dispatcher,
  buildCallbackMeta,
  trustedOrigins,
  ticketSecret,
  clock,
}) {
  if (!(trustedOrigins instanceof Set))
    throw new TypeError(
      "createLinkCompleteHandler: trustedOrigins must be a Set",
    );
  if (typeof ticketSecret !== "string" || ticketSecret.length === 0)
    throw new TypeError(
      "createLinkCompleteHandler: ticketSecret must be a non-empty string",
    );
  if (!clock || typeof clock.now !== "function")
    throw new TypeError("createLinkCompleteHandler: clock is required");

  return async (c) => {
    const linkToken = c.req.query("state");
    if (!linkToken) {
      return c.html(
        "<!DOCTYPE html><html><body><h1>Error</h1>" +
          "<p>Missing state parameter.</p></body></html>",
        400,
      );
    }

    const ticket = c.req.query("ticket");
    const verify = verifyCompletionTicket({
      ticket,
      expected: { linkToken },
      trustedOrigins,
      secret: ticketSecret,
      now: clock.now(),
    });
    if (!verify.ok) {
      return c.html(UNABLE_TO_VERIFY_HTML);
    }

    const target = await store.resolvePendingDispatch(
      linkToken,
      verify.claims.surfaceUserId,
    );
    if (!target) {
      return c.html(
        "<!DOCTYPE html><html><body><h1>Already processed</h1>" +
          "<p>This link has already been used or has expired." +
          "</p></body></html>",
      );
    }
    if (target.unattributable) {
      // Bridge refused to consume because the ticket's surfaceUserId does
      // not match the pending row. The pending entry is left intact for
      // the legitimate user.
      return c.html(UNABLE_TO_VERIFY_HTML);
    }

    const ctx = await store.loadByChannel(channel, target.discussion_id);
    if (!ctx) {
      return c.html(
        "<!DOCTYPE html><html><body><h1>Error</h1>" +
          "<p>Discussion not found.</p></body></html>",
        404,
      );
    }

    const userTurn = [...ctx.history]
      .reverse()
      .find((e) => e.role === "user" && e.author === target.surface_user_id);
    if (!userTurn) {
      return c.html(
        "<!DOCTYPE html><html><body><h1>Error</h1>" +
          "<p>No message found to re-dispatch.</p></body></html>",
        404,
      );
    }

    const result = await dispatcher.dispatch({
      ctx,
      prompt: buildPrompt(userTurn.text, ctx.history),
      requester: target.surface_user_id,
      callbackMeta: buildCallbackMeta(ctx),
      workflowInputs: { discussionId: target.discussion_id },
    });

    if (result.kind === "dispatched") {
      return c.html(
        "<!DOCTYPE html><html><body><h1>Processing</h1>" +
          "<p>Your message is being processed. " +
          "You can close this window.</p></body></html>",
      );
    }

    return c.html(
      "<!DOCTYPE html><html><body><h1>Unable to dispatch</h1>" +
        "<p>Your account could not be verified. Please try " +
        "linking again from the conversation.</p></body></html>",
    );
  };
}
