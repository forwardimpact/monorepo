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
  "pushPorcelain",
  "remoteRefTip",
  "isAncestor",
  "statusPorcelain",
  "revParse",
  "diffNameStatus",
  "stashDropBySha",
];

// A response descriptor models one git failure: an `Error` thrown as-is, or
// `{ throw: <message>, stderr?: <text> }` thrown as an Error that carries
// that stderr. This mirrors how GitClient's `#runRaw` surfaces a failure
// (the real GitError exposes `.stderr`). So a caller that inspects stderr
// (e.g. to tell a push rejection from an auth failure) sees a faithful shape.
function isResponseDescriptor(value) {
  return (
    value instanceof Error ||
    (value && typeof value === "object" && "throw" in value)
  );
}

// A configured response that is an array of response descriptors is a per-call
// sequence. The mock takes one entry per invocation. It reuses the last entry
// after the sequence runs out. So a test can express "push rejected on call 1,
// succeeds on call 2". The mock returns the whole array when it holds plain
// data (e.g. a `logByAuthor` commit list). The descriptor check keeps data
// returns and failure sequences apart.
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

// Per-method default returns when the caller configures no `responses[method]`.
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
 * `GitClient` surface is a spy that returns a no-op success by default, or
 * the configured `responses[method]` value. `withAuth(token)` returns a
 * client that shares the same `calls` log. The mock records every call on
 * `calls`.
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
