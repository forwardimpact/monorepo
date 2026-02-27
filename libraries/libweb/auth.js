import { createHmac } from "node:crypto";

/**
 * @typedef {object} AuthUser
 * @property {string} id - User ID (sub claim)
 * @property {string} [email] - User email
 * @property {string} role - User role
 */

/**
 * @typedef {object} Middleware
 * @property {Function} create - Creates middleware function for Hono
 */

/**
 * Authentication middleware implementation for Hono using HS256-signed JWT
 * @implements {Middleware}
 */
export class AuthMiddleware {
  #jwtSecret;

  /**
   * Creates authentication middleware instance
   * @param {import("@forwardimpact/libconfig").Config} config - Configuration object
   */
  constructor(config) {
    if (!config) throw new Error("config is required");
    const secret = config.jwtSecret?.();
    if (!secret) throw new Error("JWT_SECRET environment variable is required");
    this.#jwtSecret = secret;
  }

  /**
   * Verifies an HS256-signed JWT token
   * @param {string} token - The JWT token to verify
   * @returns {{ valid: boolean, user?: AuthUser, error?: string }} Verification result with user data or error
   */
  #verifyToken(token) {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) {
        return { valid: false, error: "Invalid token format" };
      }

      const [headerB64, payloadB64, signatureB64] = parts;

      // Decode and validate header
      const header = JSON.parse(Buffer.from(headerB64, "base64url").toString());
      if (header.alg !== "HS256") {
        return { valid: false, error: "Invalid algorithm" };
      }

      // Verify signature (HS256)
      const expectedSignature = createHmac("sha256", this.#jwtSecret)
        .update(`${headerB64}.${payloadB64}`)
        .digest("base64url");

      if (signatureB64 !== expectedSignature) {
        return { valid: false, error: "Invalid signature" };
      }

      // Decode and parse payload
      const payload = JSON.parse(
        Buffer.from(payloadB64, "base64url").toString(),
      );

      const now = Math.floor(Date.now() / 1000);

      // Check expiration (required)
      if (!payload.exp) {
        return { valid: false, error: "Token missing expiration" };
      }
      if (payload.exp < now) {
        return { valid: false, error: "Token expired" };
      }

      // Check issued at (reject tokens from the future with 5 min tolerance)
      if (payload.iat && payload.iat > now + 300) {
        return { valid: false, error: "Token issued in the future" };
      }

      // Check audience
      if (payload.aud !== "authenticated") {
        return { valid: false, error: "Invalid audience" };
      }

      return {
        valid: true,
        user: {
          id: payload.sub,
          email: payload.email,
          role: payload.role,
        },
      };
    } catch {
      return { valid: false, error: "Token verification failed" };
    }
  }

  /**
   * Creates authentication middleware
   * @param {object} [options] - Middleware options
   * @param {boolean} [options.optional] - If true, allows unauthenticated requests
   * @returns {Function} Hono middleware function
   */
  create(options = {}) {
    const { optional = false } = options;

    return async (c, next) => {
      const authHeader = c.req.header("Authorization");

      if (!authHeader?.startsWith("Bearer ")) {
        if (optional) {
          c.set("user", null);
          await next();
          return;
        }
        return c.json({ error: "Missing authorization header" }, 401);
      }

      const token = authHeader.slice(7);
      const result = this.#verifyToken(token);

      if (!result.valid) {
        if (optional) {
          c.set("user", null);
          await next();
          return;
        }
        return c.json({ error: result.error }, 401);
      }

      c.set("user", result.user);
      await next();
    };
  }
}
