import { createMockClock, createTestRuntime } from "@forwardimpact/libmock";

export const NOW = Date.parse("2026-09-02T16:49:00Z");
export const WINDOW_MS = 2 * 3600000;

/** Build a runtime whose clock starts at the fixture's `now`. */
export function testRuntime(env = {}) {
  const runtime = createTestRuntime({ clock: createMockClock({ start: NOW }) });
  Object.assign(runtime.proc.env, env);
  return runtime;
}

/** An ISO timestamp `minutesAgo` minutes before the fixture's `now`. */
export function ago(minutesAgo) {
  return new Date(NOW - minutesAgo * 60000).toISOString();
}

/** Build `count` commit items, each `minutesAgo` minutes old. */
export function commits(count, minutesAgo = 10) {
  return Array.from({ length: count }, () => ({
    commit: { committer: { date: ago(minutesAgo) } },
  }));
}

/** Build `count` items carrying `created_at`, each `minutesAgo` minutes old. */
export function created(count, minutesAgo = 10, extra = {}) {
  return Array.from({ length: count }, () => ({
    created_at: ago(minutesAgo),
    ...extra,
  }));
}

/**
 * Build a stub request that maps a path prefix to a response body. A mapped
 * value that is an `Error` throws. Every call is recorded on `.calls`.
 */
export function stubRequest(routes, { headers } = {}) {
  const calls = [];
  const request = async (path, init) => {
    calls.push({ path, init });
    const key = Object.keys(routes).find((prefix) => path.startsWith(prefix));
    if (key === undefined) throw new Error(`unmapped path ${path}`);
    const value = routes[key];
    if (value instanceof Error) throw value;
    return {
      body: typeof value === "function" ? value(path) : value,
      headers: headers ?? new Headers(),
    };
  };
  request.calls = calls;
  return request;
}

/** A minimal invocation context for a command handler. */
export function context(options, runtime) {
  return { options, args: {}, deps: { runtime } };
}
