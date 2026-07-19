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
      `PRODUCT_LANDMARK_TOKEN ${label} is not valid base64url`,
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new IdentityUnresolvedError(
      `PRODUCT_LANDMARK_TOKEN ${label} is not valid JSON`,
    );
  }
}

/**
 * Validate the structure, expiry, and (when the secret is available)
 * HMAC of the caller's JWT (sourced from `config.token`). Returns the
 * resolved identity. The production engineer-side path runs without
 * the secret — the JWT is trusted at the shape level, and Postgres
 * rejects forgeries at the RLS clamp on the next round trip.
 */
function resolveFromJwt(jwt, config, runtime) {
  const parts = jwt.split(".");
  if (parts.length !== 3)
    throw new IdentityUnresolvedError("PRODUCT_LANDMARK_TOKEN is not a JWT");

  const header = parseJwtSegment(parts[0], "header");
  if (header.alg !== "HS256" || header.typ !== "JWT")
    throw new IdentityUnresolvedError(
      "PRODUCT_LANDMARK_TOKEN header rejected (HS256 + JWT required)",
    );

  const claims = parseJwtSegment(parts[1], "payload");
  if (typeof claims.email !== "string" || !claims.email)
    throw new IdentityUnresolvedError(
      "PRODUCT_LANDMARK_TOKEN missing string email claim",
    );
  if (
    typeof claims.exp !== "number" ||
    claims.exp * 1000 <= runtime.clock.now()
  )
    throw new IdentityUnresolvedError("PRODUCT_LANDMARK_TOKEN is expired");

  // HMAC verification is best-effort: monorepo contributors get the
  // secret via `just env-setup`; external `npx fit-landmark login` users
  // never get it, and Postgres RLS catches forgeries on the next call.
  let secret;
  try {
    secret = config?.supabaseJwtSecret();
  } catch {
    // operator-only install path; engineer install never has the secret
  }
  if (secret) {
    const actual = Buffer.from(parts[2], "base64url");
    if (actual.length !== HS256_DIGEST_BYTES)
      throw new IdentityUnresolvedError(
        "PRODUCT_LANDMARK_TOKEN signature does not verify",
      );
    const expected = createHmac("sha256", secret)
      .update(`${parts[0]}.${parts[1]}`)
      .digest();
    if (!timingSafeEqual(expected, actual))
      throw new IdentityUnresolvedError(
        "PRODUCT_LANDMARK_TOKEN signature does not verify",
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
 * @param {object} config - libconfig Config for the landmark product.
 * @param {object} runtime - The injected collaborator bag.
 * @param {NodeJS.ProcessEnv} env
 * @param {(url:string,key:string) => any} createClient
 */
async function refreshSession(creds, config, runtime, env, createClient) {
  let url, anonKey;
  try {
    url = config.supabaseUrl();
    anonKey = config.supabaseAnonKey();
  } catch (err) {
    throw new IdentityUnresolvedError(
      `session refresh needs SUPABASE_URL and SUPABASE_ANON_KEY: ${err.message}`,
    );
  }
  const sb = createClient(url, anonKey);
  const { data, error } = await sb.auth.refreshSession({
    refresh_token: creds.refresh_token,
  });
  if (error || !data?.session) {
    await clearCredentials(runtime, env);
    throw new IdentityUnresolvedError(
      "session expired and refresh failed — run `fit-landmark login` again",
    );
  }
  const next = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token ?? creds.refresh_token,
    expires_at: runtime.clock.now() + (data.session.expires_in ?? 3600) * 1000,
    email: data.user?.email ?? creds.email,
  };
  await writeCredentials(runtime, next, env);
  return next;
}

/**
 * Resolve the caller's identity. Precedence:
 *
 *   1. `config.token` — the Landmark product config's `token` param,
 *      resolved by libconfig from `PRODUCT_LANDMARK_TOKEN` (shell env)
 *      → `.env` `PRODUCT_LANDMARK_TOKEN` → `config.json`
 *      `product.landmark.token` (CI, signTestToken, operator-issued
 *      long-lived tokens, kata-interview substrate). The JWT is
 *      validated for shape and (when the JWT secret is available)
 *      signature, then returned as-is.
 *   2. Credentials store — populated by `fit-landmark login`. If the
 *      access token has expired (or is within REFRESH_LEAD_MS of doing so),
 *      attempt a Supabase refresh and persist the result.
 *
 * @param {object} params
 * @param {object} params.config - libconfig Config for the landmark product.
 * @param {object} params.runtime - The injected collaborator bag.
 * @param {NodeJS.ProcessEnv} [params.env] - Process env; carries LANDMARK_CREDENTIALS_FILE.
 * @param {(url:string,key:string)=>any} [params.createClient]
 * @returns {Promise<{email: string, jwt: string}>}
 * @throws {IdentityUnresolvedError}
 */
export async function resolveIdentity({
  config,
  runtime,
  env = runtime.proc.env,
  createClient,
} = {}) {
  if (config?.token) {
    return resolveFromJwt(config.token, config, runtime);
  }

  const creds = await readCredentials(runtime, env);
  if (!creds)
    throw new IdentityUnresolvedError(
      "no session found — run `fit-landmark login`",
    );

  if (
    typeof creds.expires_at === "number" &&
    runtime.clock.now() >= creds.expires_at - REFRESH_LEAD_MS
  ) {
    const cc =
      createClient ?? (await import("@supabase/supabase-js")).createClient;
    const refreshed = await refreshSession(creds, config, runtime, env, cc);
    return { email: refreshed.email, jwt: refreshed.access_token };
  }

  return { email: creds.email, jwt: creds.access_token };
}

/**
 * Resolve the subject email for a subject-scoped command: an explicit
 * `--email` wins, else the signed-in identity's email. RLS still clamps
 * everything server-side — this only picks the default subject.
 *
 * @param {object} options - Parsed CLI options (may carry `email`).
 * @param {{email: string}|null} identity - Resolved caller identity, if any.
 * @returns {string} The subject email.
 * @throws {Error} When neither an explicit email nor an identity exists.
 */
export function resolveSubjectEmail(options, identity) {
  if (options.email) return options.email;
  if (identity?.email) return identity.email;
  throw new Error(
    "--email <email> is required (sign in with `fit-landmark login` to make it optional)",
  );
}
