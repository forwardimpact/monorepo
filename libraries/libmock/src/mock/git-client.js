import { spy } from "./spy.js";

const GIT_METHODS = [
  "clone",
  "init",
  "fetch",
  "status",
  "rebase",
  "rebaseAbort",
  "mergeOursStrategy",
  "resetSoft",
  "checkoutPaths",
  "mergeAbort",
  "unmergedPaths",
  "isMidMerge",
  "introducedByFile",
  "commitAll",
  "commitPaths",
  "push",
  "logByAuthor",
  "diffRange",
  "showFile",
  "revListCount",
  "configGet",
  "configSet",
  "aheadCount",
  "remoteGetUrl",
  "headBranch",
  "refExists",
  "mergeBaseExists",
  "remoteBranchExists",
  "fetchDeepen",
];

// A response descriptor models one git failure: an `Error` thrown as-is, or
// `{ throw: <message>, stderr?: <text> }` thrown as an Error carrying that
// stderr — mirroring how GitClient's `#runRaw` surfaces a failure (the real
// GitError exposes `.stderr`), so a caller inspecting stderr (e.g. to tell a
// push rejection from an auth failure) sees a faithful shape.
function isResponseDescriptor(value) {
  return (
    value instanceof Error ||
    (value && typeof value === "object" && "throw" in value)
  );
}

// A configured response that is an array of response descriptors is a per-call
// sequence: consumed one entry per invocation, reusing the last entry once
// exhausted, so a test can express "push rejected on call 1, succeeds on call
// 2". An array that is plain data (e.g. a `logByAuthor` commit list) is returned
// whole — the descriptor check keeps data returns and failure sequences apart.
function makeResponder(configured) {
  const isSequence =
    Array.isArray(configured) && configured.some(isResponseDescriptor);
  if (!isSequence) return () => configured;
  let i = 0;
  return () => configured[Math.min(i++, configured.length - 1)];
}

function resolveResponse(responder) {
  const value = responder();
  if (value instanceof Error) throw value;
  if (value && typeof value === "object" && "throw" in value) {
    const err = new Error(value.throw);
    err.stderr = value.stderr ?? value.throw;
    throw err;
  }
  return value;
}

// Per-method default returns when no `responses[method]` is configured.
// Methods absent here default to a no-op success `{ stdout, stderr, exitCode }`.
const GIT_DEFAULTS = {
  revListCount: 0,
  aheadCount: 0,
  logByAuthor: [],
  diffRange: "",
  showFile: null,
  status: "",
  configGet: "",
  remoteGetUrl: "",
};

/**
 * Creates a mock `GitClient` collaborator. Every method on the real
 * `GitClient` surface is a spy returning a no-op success by default, or the
 * configured `responses[method]` value. `withAuth(token)` returns a client
 * sharing the same `calls` log. Invocations are recorded on `calls`.
 *
 * @param {object} [options]
 * @param {Record<string, unknown>} [options.responses] - Per-method returns.
 * @returns {object} The mock git client.
 */
export function createMockGitClient({ responses = {} } = {}) {
  const calls = [];
  const client = { calls };

  const responders = {};
  for (const method of GIT_METHODS) {
    if (method in responses)
      responders[method] = makeResponder(responses[method]);
    client[method] = spy(async (...args) => {
      calls.push({ method, args });
      if (method in responders) return resolveResponse(responders[method]);
      if (method in GIT_DEFAULTS) return GIT_DEFAULTS[method];
      return { stdout: "", stderr: "", exitCode: 0 };
    });
  }

  client.withAuth = spy((token) => {
    calls.push({ method: "withAuth", args: [token] });
    return client;
  });

  return client;
}
