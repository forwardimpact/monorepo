import { randomUUID } from "node:crypto";
import { normalizeBaseUrl } from "./callback-payload.js";
import { buildPrompt } from "./prompt.js";

/**
 * @param {string} authorizeUrl
 * @param {string} callbackBaseUrl
 * @returns {{ linkToken: string, augmentedUrl: string }}
 */
export function prepareLinkResume(authorizeUrl, callbackBaseUrl) {
  const linkToken = randomUUID();
  const url = new URL(authorizeUrl);
  url.searchParams.set(
    "redirect_uri",
    `${normalizeBaseUrl(callbackBaseUrl)}/api/link-complete`,
  );
  url.searchParams.set("client_state", linkToken);
  return { linkToken, augmentedUrl: url.toString() };
}

/**
 * @param {object} options
 * @returns {(c: import("hono").Context) => Promise<Response>}
 */
export function createLinkCompleteHandler({
  channel,
  store,
  dispatcher,
  buildCallbackMeta,
}) {
  return async (c) => {
    const linkToken = c.req.query("state");
    if (!linkToken) {
      return c.html(
        "<!DOCTYPE html><html><body><h1>Error</h1>" +
          "<p>Missing state parameter.</p></body></html>",
        400,
      );
    }

    const target = await store.resolvePendingDispatch(linkToken);
    if (!target) {
      return c.html(
        "<!DOCTYPE html><html><body><h1>Already processed</h1>" +
          "<p>This link has already been used or has expired." +
          "</p></body></html>",
      );
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
