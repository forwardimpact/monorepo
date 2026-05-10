import { createHmac, timingSafeEqual } from "node:crypto";

/** Thrown when no usable caller identity can be derived from the env. */
export class IdentityUnresolvedError extends Error {
  /** Wrap the reason in a prefixed message and attach code "LANDMARK_IDENTITY_UNRESOLVED". */
  constructor(reason) {
    super(`Authentication required: ${reason}`);
    this.code = "LANDMARK_IDENTITY_UNRESOLVED";
  }
}

// HS256 HMAC-SHA256 digest is fixed at 32 bytes; reject any signature whose
// decoded length deviates before invoking timingSafeEqual.
const HS256_DIGEST_BYTES = 32;

/** Decode a JWT segment as JSON; throws IdentityUnresolvedError on failure. */
function parseJwtSegment(seg, label) {
  let raw;
  try {
    raw = Buffer.from(seg, "base64url").toString("utf8");
  } catch {
    throw new IdentityUnresolvedError(
      `LANDMARK_AUTH_TOKEN ${label} is not valid base64url`,
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new IdentityUnresolvedError(
      `LANDMARK_AUTH_TOKEN ${label} is not valid JSON`,
    );
  }
}

/**
 * Resolve the caller's identity from a Supabase Auth JWT in
 * `LANDMARK_AUTH_TOKEN`.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{email: string, jwt: string}}
 * @throws {IdentityUnresolvedError}
 */
export function resolveIdentity(env = process.env) {
  const jwt = env.LANDMARK_AUTH_TOKEN;
  if (!jwt)
    throw new IdentityUnresolvedError(
      "LANDMARK_AUTH_TOKEN is not set. The Landmark CLI requires an authenticated caller.",
    );
  const parts = jwt.split(".");
  if (parts.length !== 3)
    throw new IdentityUnresolvedError("LANDMARK_AUTH_TOKEN is not a JWT");

  // Header must announce HS256 + JWT — never trust an `alg: none` token,
  // even if PostgREST would also reject it; we want the failure surface
  // here so downstream code never sees a forged email.
  const header = parseJwtSegment(parts[0], "header");
  if (header.alg !== "HS256" || header.typ !== "JWT")
    throw new IdentityUnresolvedError(
      "LANDMARK_AUTH_TOKEN header rejected (HS256 + JWT required)",
    );

  const claims = parseJwtSegment(parts[1], "payload");
  if (typeof claims.email !== "string" || !claims.email)
    throw new IdentityUnresolvedError(
      "LANDMARK_AUTH_TOKEN missing string email claim",
    );
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now())
    throw new IdentityUnresolvedError("LANDMARK_AUTH_TOKEN is expired");

  // Defense in depth: when MAP_SUPABASE_JWT_SECRET is available (test
  // harness, local dev) verify the HMAC ourselves before trusting any
  // claim. Production engineer-side callers will not have the secret;
  // for them the contract is that `email` is opaque until the first
  // PostgREST round-trip succeeds — never log or branch on it before.
  if (env.MAP_SUPABASE_JWT_SECRET) {
    const actual = Buffer.from(parts[2], "base64url");
    if (actual.length !== HS256_DIGEST_BYTES)
      throw new IdentityUnresolvedError(
        "LANDMARK_AUTH_TOKEN signature does not verify",
      );
    const expected = createHmac("sha256", env.MAP_SUPABASE_JWT_SECRET)
      .update(`${parts[0]}.${parts[1]}`)
      .digest();
    if (!timingSafeEqual(expected, actual))
      throw new IdentityUnresolvedError(
        "LANDMARK_AUTH_TOKEN signature does not verify",
      );
  }
  return { email: claims.email, jwt };
}
