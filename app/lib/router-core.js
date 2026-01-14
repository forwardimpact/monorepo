/**
 * Core Router Factory
 *
 * Pure factory function for hash-based routing with no dependencies.
 */

import { withErrorBoundary } from "./error-boundary.js";

/**
 * @typedef {Object} Route
 * @property {string} pattern - Route pattern with :params
 * @property {RegExp} regex - Compiled pattern
 * @property {string[]} paramNames - Extracted param names
 * @property {Function} handler - Route handler
 */

/**
 * @typedef {Object} RouteMatch
 * @property {Function} handler - Matched handler
 * @property {Object} params - Extracted parameters
 */

/**
 * @typedef {Object} Router
 * @property {(pattern: string, handler: Function) => void} on - Register route
 * @property {(path: string) => void} navigate - Navigate to path
 * @property {() => string} currentPath - Get current hash path
 * @property {() => void} handleRoute - Process current route
 * @property {() => void} start - Begin listening for hash changes
 * @property {() => void} stop - Stop listening for hash changes
 * @property {() => string[]} patterns - Get registered patterns
 */

/**
 * Parse route pattern into regex and param names
 * @param {string} pattern
 * @returns {{ regex: RegExp, paramNames: string[] }}
 */
function parsePattern(pattern) {
  const paramNames = [];
  const regexStr = pattern
    .replace(/:([^/]+)/g, (_, name) => {
      paramNames.push(name);
      return "([^/]+)";
    })
    .replace(/\//g, "\\/");
  return {
    regex: new RegExp(`^${regexStr}$`),
    paramNames,
  };
}

/**
 * Create a router instance
 * @param {{ onNotFound?: (path: string) => void, onError?: (error: Error) => void, renderError?: (title: string, message: string) => void }} options
 * @returns {Router}
 */
export function createRouter(options = {}) {
  const { onNotFound = () => {}, onError, renderError } = options;
  /** @type {Route[]} */
  const routes = [];
  let hashChangeHandler = null;

  /**
   * Match a path to a route
   * @param {string} path
   * @returns {RouteMatch|null}
   */
  function matchRoute(path) {
    for (const route of routes) {
      const match = path.match(route.regex);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, i) => {
          params[name] = decodeURIComponent(match[i + 1]);
        });
        return { handler: route.handler, params };
      }
    }
    return null;
  }

  /**
   * Get current path from hash (including query string)
   * @returns {string}
   */
  function currentPath() {
    return window.location.hash.slice(1) || "/";
  }

  /**
   * Handle the current route
   */
  function handleRoute() {
    const fullPath = currentPath();
    const path = fullPath.split("?")[0];
    const matched = matchRoute(path);
    if (matched) {
      matched.handler(matched.params);
    } else {
      onNotFound(path);
    }
  }

  return {
    /**
     * Register a route
     * @param {string} pattern - Route pattern (e.g., '/skills/:id')
     * @param {Function} handler - Handler function
     */
    on(pattern, handler) {
      const { regex, paramNames } = parsePattern(pattern);
      const wrappedHandler = withErrorBoundary(handler, {
        onError,
        backPath: "/",
        backText: "← Back to Home",
        renderErrorFn: renderError,
      });
      routes.push({ pattern, regex, paramNames, handler: wrappedHandler });
    },

    /**
     * Navigate to a path
     * @param {string} path
     */
    navigate(path) {
      window.location.hash = path;
    },

    currentPath,
    handleRoute,

    /**
     * Start listening for hash changes
     */
    start() {
      hashChangeHandler = () => handleRoute();
      window.addEventListener("hashchange", hashChangeHandler);
      handleRoute();
    },

    /**
     * Stop listening for hash changes
     */
    stop() {
      if (hashChangeHandler) {
        window.removeEventListener("hashchange", hashChangeHandler);
        hashChangeHandler = null;
      }
    },

    /**
     * Get all registered route patterns
     * @returns {string[]}
     */
    patterns() {
      return routes.map((r) => r.pattern);
    },
  };
}
