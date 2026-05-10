import { createHmac, timingSafeEqual } from "node:crypto";

/** Thrown when no usable caller identity can be derived from the env. */
export class IdentityUnresolvedError extends Error {
  /** Wrap the reason in a prefixed message and attach code "LANDMARK_IDENTITY_UNRESOLVED". */
  constructor(reason) {
    super(`Authentication required: ${reason}`);
    this.code = "LANDMARK_IDENTITY_UNRESOLVED";
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
      "LANDMARK_AUTH_TOKEN is not set. The Landmark CLI requires an authenticated caller — see `fit-landmark` --help for the issuance flow follow-up.",
    );
  const parts = jwt.split(".");
  if (parts.length !== 3)
    throw new IdentityUnresolvedError("LANDMARK_AUTH_TOKEN is not a JWT");
  let claims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new IdentityUnresolvedError(
      "LANDMARK_AUTH_TOKEN payload is not valid JSON",
    );
  }
  if (!claims.email)
    throw new IdentityUnresolvedError(
      "LANDMARK_AUTH_TOKEN missing email claim",
    );
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now())
    throw new IdentityUnresolvedError("LANDMARK_AUTH_TOKEN is expired");
  // Defense in depth: when MAP_SUPABASE_JWT_SECRET is available (test
  // harness, local dev) verify the HMAC ourselves before trusting any
  // claim. Production engineer-side callers will not have the secret;
  // for them the contract is that `email` is opaque until the first
  // PostgREST round-trip succeeds — never log or branch on it before.
  if (env.MAP_SUPABASE_JWT_SECRET) {
    const expected = createHmac("sha256", env.MAP_SUPABASE_JWT_SECRET)
      .update(`${parts[0]}.${parts[1]}`)
      .digest();
    const actual = Buffer.from(parts[2], "base64url");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      throw new IdentityUnresolvedError(
        "LANDMARK_AUTH_TOKEN signature does not verify",
      );
  }
  return { email: claims.email, jwt };
}
