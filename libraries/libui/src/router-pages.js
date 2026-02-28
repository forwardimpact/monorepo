/**
 * Pages Router
 *
 * Router instance for the main app pages.
 */

import { createRouter } from "./router-core.js";

/**
 * Create the pages router for the main app
 * @param {{ onNotFound?: (path: string) => void }} options
 * @returns {import('./router-core.js').Router}
 */
export function createPagesRouter(options = {}) {
  return createRouter(options);
}
