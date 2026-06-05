import grpc from "@grpc/grpc-js";

const VALIDATOR_STATUS = {
  INVALID_SIGNATURE: 401,
  EXPIRED: 401,
  WRONG_ISSUER: 403,
  WRONG_AUDIENCE: 403,
  MISSING_REPOSITORY_CLAIM: 400,
};

/**
 * Map a validator `OidcError.code` to an HTTP status. Unknown codes fall
 * back to 401 (unverifiable token) rather than 500.
 *
 * @param {{code?: string}} err
 * @returns {number}
 */
export function statusForError(err) {
  return VALIDATOR_STATUS[err?.code] ?? 401;
}

/**
 * Mount the `POST /token` OIDC-exchange route on a Hono app.
 *
 * The handler extracts the `Authorization: bearer` OIDC token, validates
 * it, and delegates minting to the gRPC provider (`services/ghserver`).
 * The provider's typed gRPC errors surface as HTTP: `NOT_FOUND` → 404
 * (repo not provisioned), `RESOURCE_EXHAUSTED` → 429 (rate limited).
 *
 * @param {import("hono").Hono} app
 * @param {object} deps
 * @param {import("./oidc-validator.js").OidcValidator} deps.validator
 * @param {{MintInstallationToken: (req: object) => Promise<{installation_token: string, expires_at: number|bigint}>}} deps.providerClient
 * @param {(name: string, obj: object) => object} deps.typed - Typed-message factory.
 * @returns {void}
 */
export function registerTokenRoute(app, { validator, providerClient, typed }) {
  app.post("/token", async (c) => {
    // HTTP auth schemes are case-insensitive; GitHub's runner sends lowercase
    // `bearer`, but accept any case so a conformant client is not rejected.
    const auth = c.req.header("authorization");
    const match = /^bearer\s+(.+)$/i.exec(auth ?? "");
    if (!match) {
      return c.json({ error: "missing bearer" }, 401);
    }
    const token = match[1];

    let claims;
    try {
      claims = await validator.validate(token);
    } catch (e) {
      return c.json({ error: e.code }, statusForError(e));
    }

    try {
      const res = await providerClient.MintInstallationToken(
        typed("MintRequest", {
          owner: claims.owner,
          name: claims.name,
          requested_by: "oidc",
        }),
      );
      return c.json({
        installation_token: res.installation_token,
        expires_at: Number(res.expires_at),
      });
    } catch (e) {
      if (e?.code === grpc.status.NOT_FOUND) {
        return c.json({ error: "not provisioned" }, 404);
      }
      if (e?.code === grpc.status.RESOURCE_EXHAUSTED) {
        return c.json({ error: "rate limited" }, 429);
      }
      throw e;
    }
  });
}
