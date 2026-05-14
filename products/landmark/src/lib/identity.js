import { createHmac, timingSafeEqual } from "node:crypto";

import {
  readCredentials,
  writeCredentials,
  clearCredentials,
} from "./credentials.js";

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

// Refresh slightly before the access token's expires_at so a long-running
// command never trips PostgREST's own clock-skew check mid-batch.
const REFRESH_LEAD_MS = 60_000;

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
 * Validate the structure, expiry, and (when the secret is available)
 * HMAC of `LANDMARK_AUTH_TOKEN`. Returns the resolved identity. The
 * production engineer-side path runs without the secret — the JWT is
 * trusted at the shape level, and Postgres rejects forgeries at the
 * RLS clamp on the next round trip.
 */
function resolveFromJwt(jwt, env) {
  const parts = jwt.split(".");
  if (parts.length !== 3)
    throw new IdentityUnresolvedError("LANDMARK_AUTH_TOKEN is not a JWT");

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

/**
 * Refresh an expiring session via Supabase Auth's refresh endpoint and
 * persist the new tokens. On failure, clear the store and throw with a
 * "run login" prompt — a stale refresh token cannot recover itself.
 *
 * @param {{access_token:string,refresh_token:string,expires_at:number,email:string}} creds
 * @param {NodeJS.ProcessEnv} env
 * @param {(url:string,key:string) => any} createClient
 */
async function refreshSession(creds, env, createClient) {
  const url = env.MAP_SUPABASE_URL;
  const anonKey = env.MAP_SUPABASE_ANON_KEY;
  if (!url || !anonKey)
    throw new IdentityUnresolvedError(
      "session refresh needs MAP_SUPABASE_URL and MAP_SUPABASE_ANON_KEY",
    );
  const sb = createClient(url, anonKey);
  const { data, error } = await sb.auth.refreshSession({
    refresh_token: creds.refresh_token,
  });
  if (error || !data?.session) {
    await clearCredentials(env);
    throw new IdentityUnresolvedError(
      "session expired and refresh failed — run `fit-landmark login` again",
    );
  }
  const next = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token ?? creds.refresh_token,
    expires_at: Date.now() + (data.session.expires_in ?? 3600) * 1000,
    email: data.user?.email ?? creds.email,
  };
  await writeCredentials(next, env);
  return next;
}

/**
 * Resolve the caller's identity. Precedence:
 *
 *   1. `LANDMARK_AUTH_TOKEN` — env override (CI, signTestToken, operator-
 *      issued long-lived tokens). The JWT is validated for shape and
 *      (when the JWT secret is available) signature, then returned as-is.
 *   2. Credentials store — populated by `fit-landmark login`. If the
 *      access token has expired (or is within REFRESH_LEAD_MS of doing so),
 *      attempt a Supabase refresh and persist the result.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{createClient?: (url:string,key:string)=>any}} [opts]
 * @returns {Promise<{email: string, jwt: string}>}
 * @throws {IdentityUnresolvedError}
 */
export async function resolveIdentity(env = process.env, opts = {}) {
  if (env.LANDMARK_AUTH_TOKEN) {
    return resolveFromJwt(env.LANDMARK_AUTH_TOKEN, env);
  }

  const creds = await readCredentials(env);
  if (!creds)
    throw new IdentityUnresolvedError(
      "no session found — run `fit-landmark login`",
    );

  if (
    typeof creds.expires_at === "number" &&
    Date.now() >= creds.expires_at - REFRESH_LEAD_MS
  ) {
    const createClient =
      opts.createClient ?? (await import("@supabase/supabase-js")).createClient;
    const refreshed = await refreshSession(creds, env, createClient);
    return { email: refreshed.email, jwt: refreshed.access_token };
  }

  return { email: creds.email, jwt: creds.access_token };
}
