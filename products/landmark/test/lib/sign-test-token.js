import { mintSupabaseJwt } from "@forwardimpact/libsecret";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

/**
 * HMAC-sign a Supabase-shaped JWT for use in tests and local fixtures.
 *
 * @param {object} params
 * @param {string} params.email
 * @param {string} [params.secret]
 * @param {number} [params.ttlSeconds]
 * @returns {string}
 */
export function signTestToken({
  email,
  secret = process.env.SUPABASE_JWT_SECRET,
  ttlSeconds = 900,
}) {
  if (!secret) throw new Error("signTestToken: SUPABASE_JWT_SECRET not set");
  return mintSupabaseJwt({ email, secret, ttlSeconds }, createDefaultRuntime());
}
