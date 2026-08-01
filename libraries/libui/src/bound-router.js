/**
 * Bound Router — a registry and a dispatcher. It produces an
 * InvocationContext on each route match. It exposes activeRoute as a
 * reactive.
 */

import { parsePattern } from "./router-core.js";
import { createReactive } from "./reactive.js";
import { freezeInvocationContext } from "./invocation-context.js";
import { withErrorBoundary } from "./error-boundary.js";

/**
 * @typedef {Object} BoundRouter
 * @property {(descriptor: import('./route-descriptor.js').RouteDescriptor) => void} register
 * @property {() => import('./route-descriptor.js').RouteDescriptor[]} routes
 * @property {() => void} start
 * @property {() => void} stop
 * @property {(path: string) => void} navigate
 * @property {() => string} currentPath
 * @property {import('./reactive.js').Reactive<{ descriptor: import('./route-descriptor.js').RouteDescriptor, ctx: import('./invocation-context.js').InvocationContext } | null>} activeRoute
 */

/**
 * @param {{ data?: Object, vocabularyBase?: string, onNotFound?: (path: string) => void, onError?: (error: Error) => void, renderError?: (title: string, message: string) => void }} [options]
 * @returns {BoundRouter}
 */
export function createBoundRouter(options = {}) {
  const {
    data,
    vocabularyBase,
    onNotFound = () => {},
    onError,
    renderError,
  } = options;

  const entries = [];
  const activeRoute = createReactive(null);
  let hashChangeHandler = null;
  let originalReplaceState = null;
  let started = false;

  function register(descriptor) {
    const { regex, paramNames } = parsePattern(descriptor.pattern);
    const wrappedPage = withErrorBoundary(descriptor.page, {
      onError,
      backPath: "/",
      backText: "← Back to Home",
      renderErrorFn: renderError,
    });
    entries.push({ descriptor, regex, paramNames, wrappedPage });
  }

  function routes() {
    return entries.map((e) => e.descriptor);
  }

  function currentPath() {
    return window.location.hash.slice(1) || "/";
  }

  function parseQueryString(qs) {
    const options = {};
    if (!qs) return options;
    const params = new URLSearchParams(qs);
    for (const key of params.keys()) {
      const values = params.getAll(key);
      if (values.length > 1) {
        options[key] = values;
      } else {
        const v = values[0];
        options[key] = v === "" ? true : v;
      }
    }
    return options;
  }

  function handleRoute() {
    const fullPath = currentPath();
    const [pathPart, queryPart] = fullPath.split("?");

    for (const entry of entries) {
      const match = pathPart.match(entry.regex);
      if (match) {
        const args = {};
        entry.paramNames.forEach((name, i) => {
          args[name] = decodeURIComponent(match[i + 1]);
        });
        const queryOptions = parseQueryString(queryPart);
        const ctx = freezeInvocationContext({
          data,
          args,
          options: queryOptions,
        });
        activeRoute.set({ descriptor: entry.descriptor, ctx });
        window.scrollTo(0, 0);
        entry.wrappedPage(ctx, { vocabularyBase });
        return;
      }
    }
    activeRoute.set(null);
    onNotFound(pathPart);
  }

  function start() {
    if (started) return;
    started = true;
    hashChangeHandler = () => handleRoute();
    window.addEventListener("hashchange", hashChangeHandler);

    originalReplaceState = history.replaceState;
    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      handleRoute();
    };

    handleRoute();
  }

  function stop() {
    if (!started) return;
    started = false;
    if (hashChangeHandler) {
      window.removeEventListener("hashchange", hashChangeHandler);
      hashChangeHandler = null;
    }
    if (originalReplaceState) {
      history.replaceState = originalReplaceState;
      originalReplaceState = null;
    }
  }

  function navigate(path) {
    window.location.hash = path;
  }

  return { register, routes, start, stop, navigate, currentPath, activeRoute };
}
