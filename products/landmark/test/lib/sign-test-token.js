import { createHmac, randomUUID } from "node:crypto";

const b64url = (b) => Buffer.from(b).toString("base64url");

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
  secret = process.env.MAP_SUPABASE_JWT_SECRET,
  ttlSeconds = 900,
}) {
  if (!secret)
    throw new Error("signTestToken: MAP_SUPABASE_JWT_SECRET not set");
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({
      role: "authenticated",
      aud: "authenticated",
      email,
      sub: randomUUID(),
      iss: "supabase",
      iat: now,
      exp: now + ttlSeconds,
    }),
  );
  const sig = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}
