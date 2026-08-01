import { randomUUID } from "node:crypto";
import { isTrusted } from "@forwardimpact/libutil/trusted-origins";
import { verifyCompletionTicket } from "@forwardimpact/libutil/completion-ticket";
import { normalizeBaseUrl } from "./callback-payload.js";
import { buildPrompt } from "./prompt.js";

/**
 * Prepare a link-resume URL for the IdP authorize step.
 *
 * This function returns a discriminated result. A missing `catch` in the
 * caller cannot become a 5xx oracle. The keyword-arg shape makes "forgot to
 * pass trustedOrigins" a loud boot-time `TypeError` for any future xbridge.
 *
 * @param {object} args
 * @param {string} args.authorizeUrl Upstream IdP authorize URL the bridge
 *   intends to post into the channel.
 * @param {string} args.callbackBaseUrl Bridge's own callback base URL. The
 *   function composes the per-bridge `/api/link-complete` from it.
 * @param {Set<string>} args.trustedOrigins Trusted-origin set that
 *   `loadTrustedIdpOrigins` produces. Required. A missing or non-Set value
 *   throws.
 * @param {string} [args.tenantId] Resolved tenant that scopes the dispatch.
 *   When present, the function sets it as the `tenant_id` query param. The
 *   authorize round trip then carries it to `ghuser` `Begin` →
 *   `VerifyPendingDispatch`. This matches the `PutPendingDispatch` write key
 *   by construction. An absent tenant leaves the URL unchanged.
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
  "<p>The bridge could not verify the completion request. Please " +
  "link again from the conversation.</p></body></html>";

/**
 * Factory for the `/api/link-complete` GET handler.
 *
 * The handler verifies the ticket **before** it touches the store. An
 * attacker without a valid ticket exits at the verify step. That attacker
 * never sees a present-vs-absent timing oracle on `linkToken`.
 *
 * The bridge runs the `surface_user_id` cross-check **server-side**. It
 * passes `verify.claims.surfaceUserId` as `expectedSurfaceUserId` to
 * `store.resolvePendingDispatch`. On a mismatch the bridge refuses to
 * consume the entry. An attacker can mint a valid ticket against the
 * victim's `link_token`. For example, the attacker drives the IdP
 * round-trip under their own account with `client_state=victim_link_token`.
 * That attacker still cannot drain the auto-resume affordance. The bridge
 * returns `{ unattributable: true }`. The entry stays available for the
 * legitimate user.
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
          "<p>This link was already used, or it expired." +
          "</p></body></html>",
      );
    }
    if (target.unattributable) {
      // The bridge refused to consume the entry because the ticket's
      // surfaceUserId does not match the pending row. The bridge leaves
      // the pending entry intact for the legitimate user.
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
          "<p>The bridge found no message to re-dispatch.</p>" +
          "</body></html>",
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
          "<p>The bridge processes your message now. " +
          "You can close this window.</p></body></html>",
      );
    }

    return c.html(
      "<!DOCTYPE html><html><body><h1>Unable to dispatch</h1>" +
        "<p>The bridge could not verify your account. Please " +
        "link again from the conversation.</p></body></html>",
    );
  };
}
