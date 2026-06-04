import { jwtVerify, createLocalJWKSet, errors } from "jose";

/**
 * Typed validation failure. The HTTP handler maps `code` to a status:
 * `INVALID_SIGNATURE` / `EXPIRED` → 401, `WRONG_ISSUER` /
 * `WRONG_AUDIENCE` → 403, `MISSING_REPOSITORY_CLAIM` → 400.
 */
export class OidcError extends Error {
  /**
   * @param {string} code
   * @param {string} [message]
   */
  constructor(code, message = code) {
    super(message);
    this.name = "OidcError";
    this.code = code;
  }
}

/**
 * Translate a `jose` verification error into a typed `OidcError`.
 *
 * @param {unknown} err
 * @returns {OidcError}
 */
function toOidcError(err) {
  if (
    err instanceof errors.JWSSignatureVerificationFailed ||
    err instanceof errors.JWKSNoMatchingKey
  ) {
    return new OidcError("INVALID_SIGNATURE", "signature verification failed");
  }
  if (err instanceof errors.JWTExpired) {
    return new OidcError("EXPIRED", "token expired");
  }
  if (err instanceof errors.JWTClaimValidationFailed) {
    if (err.claim === "iss") return new OidcError("WRONG_ISSUER");
    if (err.claim === "aud") return new OidcError("WRONG_AUDIENCE");
    return new OidcError("INVALID_SIGNATURE", err.message);
  }
  // Malformed token, bad algorithm, nbf-in-future, etc. — treat as an
  // unverifiable signature rather than leaking jose internals.
  return new OidcError("INVALID_SIGNATURE", "token is not verifiable");
}

const SIGNATURE_FAILURE_CODES = new Set([
  "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
  "ERR_JWKS_NO_MATCHING_KEY",
]);

/**
 * Validates GitHub Actions OIDC tokens and extracts the `repository`
 * claim. Verifies the JWS signature against the issuer's JWKS, then the
 * `iss`, `aud`, `exp`, and `nbf` claims. On a signature failure the
 * validator invalidates the JWKS cache once and retries — recovering from
 * key rotation without a forced restart.
 */
export class OidcValidator {
  #jwks;
  #issuer;
  #audience;

  /**
   * @param {object} options
   * @param {import("./jwks-cache.js").JwksCache} options.jwks
   * @param {string} options.issuer - Expected `iss`.
   * @param {string} options.audience - Expected `aud`.
   */
  constructor({ jwks, issuer, audience }) {
    if (!jwks) throw new Error("jwks cache is required");
    if (!issuer) throw new Error("issuer is required");
    if (!audience) throw new Error("audience is required");
    this.#jwks = jwks;
    this.#issuer = issuer;
    this.#audience = audience;
  }

  /**
   * @param {string} token - The raw OIDC JWT.
   * @returns {Promise<{repository: string, owner: string, name: string}>}
   * @throws {OidcError}
   */
  async validate(token) {
    const payload = await this.#verify(token);
    if (!payload.repository || !String(payload.repository).includes("/")) {
      throw new OidcError("MISSING_REPOSITORY_CLAIM");
    }
    const [owner, name] = String(payload.repository).split("/");
    return { repository: payload.repository, owner, name };
  }

  /**
   * Verify the JWT, retrying once with a refreshed JWKS on signature
   * failure (JWKS rotation recovery).
   *
   * @param {string} token
   * @returns {Promise<object>} The verified payload.
   */
  async #verify(token) {
    try {
      return await this.#verifyOnce(token);
    } catch (err) {
      if (!SIGNATURE_FAILURE_CODES.has(err?.code)) throw toOidcError(err);
      this.#jwks.invalidate();
      try {
        return await this.#verifyOnce(token);
      } catch (retryErr) {
        throw toOidcError(retryErr);
      }
    }
  }

  /**
   * @param {string} token
   * @returns {Promise<object>}
   */
  async #verifyOnce(token) {
    const keys = await this.#jwks.getKeys();
    const keyResolver = createLocalJWKSet({ keys });
    const { payload } = await jwtVerify(token, keyResolver, {
      issuer: this.#issuer,
      audience: this.#audience,
      // Pin the signature algorithm. GitHub Actions OIDC tokens are RS256;
      // restricting the accepted set blocks an attacker from downgrading to a
      // weaker algorithm (or `alg: none`) that a permissive verifier accepts.
      algorithms: ["RS256"],
    });
    return payload;
  }
}
