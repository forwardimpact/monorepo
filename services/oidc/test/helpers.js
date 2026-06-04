import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createMockClock } from "@forwardimpact/libmock";
import { JwksCache, OidcValidator } from "../index.js";

export const ISSUER = "https://token.actions.githubusercontent.com";
export const AUDIENCE = "fit-ghserver";

/**
 * Build a validator backed by a freshly generated RSA key, plus a `sign`
 * helper that mints tokens against that key (or, for the signature-failure
 * case, against a foreign key).
 *
 * @returns {Promise<{validator: OidcValidator, jwks: JwksCache, sign: Function, foreignKey: object}>}
 */
export async function buildValidator() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const foreign = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test-key";
  jwk.alg = "RS256";

  const clock = createMockClock({ start: 0 });
  const fetchFn = async (url) =>
    url.endsWith("/.well-known/openid-configuration")
      ? { json: async () => ({ jwks_uri: `${ISSUER}/keys` }) }
      : { json: async () => ({ keys: [jwk] }) };

  const jwks = new JwksCache({ clock, fetch: fetchFn, issuer: ISSUER });
  const validator = new OidcValidator({
    jwks,
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  /**
   * @param {object} [opts]
   * @param {string} [opts.issuer]
   * @param {string} [opts.audience]
   * @param {string|null} [opts.repository]
   * @param {number} [opts.exp] - Unix seconds; default 1h from now.
   * @param {boolean} [opts.foreignKey] - Sign with a key not in the JWKS.
   * @returns {Promise<string>}
   */
  const sign = async ({
    issuer = ISSUER,
    audience = AUDIENCE,
    repository = "acme/agents",
    exp = Math.floor(Date.now() / 1000) + 3600,
    foreignKey = false,
  } = {}) => {
    const payload = {};
    if (repository !== null) payload.repository = repository;
    const builder = new SignJWT(payload)
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuedAt()
      .setIssuer(issuer)
      .setAudience(audience)
      .setExpirationTime(exp);
    return builder.sign(foreignKey ? foreign.privateKey : privateKey);
  };

  return { validator, jwks, sign };
}
