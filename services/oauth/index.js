import { createHttpService } from "@forwardimpact/libhttp";
import * as types from "@forwardimpact/libtype";

const OUTCOME_PAGES = {
  identity_mismatch:
    "<!DOCTYPE html><html><body><h1>Account mismatch</h1>" +
    "<p>The account that authorized does not match the " +
    "account that requested linking. No binding was created. " +
    "Please try again from the correct account.</p></body></html>",
  untrusted_origin:
    "<!DOCTYPE html><html><body><h1>Account not linked</h1>" +
    "<p>The identity provider that authorized is not in the " +
    "configured trusted set. No binding was created.</p></body></html>",
};

const LINKED_PAGE =
  "<!DOCTYPE html><html><body><h1>Linked</h1>" +
  "<p>Your account has been linked. You can close this window.</p></body></html>";

function buildRedirectUrl(result) {
  const url = new URL(result.redirect_uri);
  url.searchParams.set("code", result.downstream_code);
  if (result.client_state) url.searchParams.set("state", result.client_state);
  if (result.completion_ticket)
    url.searchParams.set("ticket", result.completion_ticket);
  return url.toString();
}

/**
 * Create the OAuth 2.1 authorization server HTTP adapter.
 *
 * Transport boilerplate (security headers, error envelope, `/health`, lifecycle)
 * is owned by `@forwardimpact/libhttp`; this factory only declares the OAuth
 * routes inside the `configure` callback.
 *
 * @param {object} options
 * @param {object} options.config
 * @param {object} options.logger
 * @param {object} options.providerClient
 * @returns {{ app: import("hono").Hono, address: () => object|null, start: () => Promise<void>, stop: () => Promise<void> }}
 */
export function createOauthService({ config, logger, providerClient }) {
  const providerTypes = types[config.provider];
  const typed = (name, obj) => providerTypes[name].fromObject(obj);

  const metadata = {
    issuer: config.issuer,
    authorization_endpoint: `${config.issuer}/authorize`,
    token_endpoint: `${config.issuer}/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
  };

  return createHttpService({
    name: "oauth",
    config,
    logger,
    configure(app) {
      app.get("/.well-known/oauth-authorization-server", (c) =>
        c.json(metadata),
      );

      app.get("/authorize", async (c) => {
        const {
          surface,
          surface_user_id,
          redirect_uri,
          code_challenge,
          scope,
          client_state,
          tenant_id,
        } = c.req.query();
        if (!surface || !surface_user_id) {
          return c.json({ error: "invalid_request" }, 400);
        }
        const scopes = scope ? scope.split(" ") : [];

        const result = await providerClient.Begin(
          typed("BeginRequest", {
            surface,
            surface_user_id,
            redirect_uri: redirect_uri || undefined,
            code_challenge: code_challenge || undefined,
            scopes,
            client_state: client_state || undefined,
            tenant_id: tenant_id || undefined,
          }),
        );

        if (result.outcome) {
          return c.json({ error: result.outcome }, 503);
        }
        return c.redirect(result.upstream_authorize_url, 302);
      });

      app.get("/callback", async (c) => {
        const { code, state } = c.req.query();
        if (!code || !state) {
          return c.json({ error: "invalid_request" }, 400);
        }

        const result = await providerClient.Complete(
          typed("CompleteRequest", { code, state }),
        );

        const outcomePage = OUTCOME_PAGES[result.outcome];
        if (outcomePage) return c.html(outcomePage);

        if (result.redirect_uri) {
          return c.redirect(buildRedirectUrl(result), 302);
        }

        return c.html(LINKED_PAGE);
      });

      app.post("/token", async (c) => {
        const body = await c.req.parseBody();
        if (body.grant_type && body.grant_type !== "authorization_code") {
          return c.json({ error: "unsupported_grant_type" }, 400);
        }
        if (!body.code) {
          return c.json({ error: "invalid_request" }, 400);
        }
        const result = await providerClient.Redeem(
          typed("RedeemRequest", {
            code: body.code,
            code_verifier: body.code_verifier,
          }),
        );

        return c.json({
          access_token: result.access_token,
          token_type: result.token_type,
          expires_in: Number(result.expires_in),
        });
      });
    },
  });
}
