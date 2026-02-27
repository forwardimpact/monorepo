import { cors } from "hono/cors";

/**
 * @typedef {object} Middleware
 * @property {Function} create - Creates middleware function for Hono
 */

/**
 * CORS middleware implementation for Hono
 * @implements {Middleware}
 */
export class CorsMiddleware {
  /**
   * Creates CORS middleware instance
   * @param {import("@forwardimpact/libconfig").Config} [_config] - Configuration object
   */
  constructor(_config = null) {}

  /**
   * Creates CORS middleware
   * @param {object} options - CORS options
   * @returns {Function} Hono middleware function
   */
  create(options = {}) {
    const defaultOptions = {
      origin: ["http://localhost:3000"],
      allowMethods: ["GET", "POST"],
      allowHeaders: ["Content-Type", "X-GitHub-Token"],
    };

    return cors({ ...defaultOptions, ...options });
  }
}
