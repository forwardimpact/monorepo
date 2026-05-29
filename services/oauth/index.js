import { Hono } from "hono";
import { serve } from "@hono/node-server";
import * as types from "@forwardimpact/libtype";

/**
 * Create the OAuth 2.1 authorization server HTTP adapter.
 * @param {object} options
 * @param {object} options.config
 * @param {object} options.logger
 * @param {object} options.providerClient
 * @returns {{ app: import("hono").Hono, address: () => object|null, start: () => Promise<void>, stop: () => Promise<void> }}
 */
export function createOauthService({ config, logger, providerClient }) {
  const providerTypes = types[config.provider];
  const typed = (name, obj) => providerTypes[name].fromObject(obj);
  const app = new Hono();

  app.onError((err, c) => {
    logger.error("oauth.error", err.message);
    return c.json({ error: "server_error" }, 500);
  });

  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Cache-Control", "no-store");
  });

  const metadata = {
    issuer: config.issuer,
    authorization_endpoint: `${config.issuer}/authorize`,
    token_endpoint: `${config.issuer}/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
  };

  app.get("/.well-known/oauth-authorization-server", (c) => c.json(metadata));

  app.get("/authorize", async (c) => {
    const {
      surface,
      surface_user_id,
      redirect_uri,
      code_challenge,
      scope,
      client_state,
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
      }),
    );

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

    if (result.outcome === "identity_mismatch") {
      return c.html(
        "<!DOCTYPE html><html><body><h1>Account mismatch</h1>" +
          "<p>The account that authorized does not match the " +
          "account that requested linking. No binding was created. " +
          "Please try again from the correct account.</p></body></html>",
      );
    }

    if (result.redirect_uri) {
      const url = new URL(result.redirect_uri);
      url.searchParams.set("code", result.downstream_code);
      if (result.client_state)
        url.searchParams.set("state", result.client_state);
      return c.redirect(url.toString(), 302);
    }

    return c.html(
      "<!DOCTYPE html><html><body><h1>Linked</h1><p>Your account has been linked. You can close this window.</p></body></html>",
    );
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

  app.get("/health", (c) => c.json({ status: "ok" }));

  let server = null;

  return {
    app,
    address() {
      if (!server || typeof server.address !== "function") return null;
      const addr = server.address();
      if (!addr || typeof addr === "string") return null;
      return { port: addr.port };
    },
    async start() {
      const { host, port } = config;
      await new Promise((resolve) => {
        server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
          logger.info("oauth.server", "listening", {
            host,
            port: info?.port ?? port,
          });
          resolve();
        });
      });
    },
    async stop() {
      if (!server) return;
      await new Promise((resolve) => server.close(() => resolve()));
      server = null;
    },
  };
}
