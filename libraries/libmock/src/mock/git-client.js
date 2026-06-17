import { spy } from "./spy.js";

const GIT_METHODS = [
  "clone",
  "init",
  "fetch",
  "status",
  "rebase",
  "rebaseAbort",
  "mergeOursStrategy",
  "commitAll",
  "commitPaths",
  "push",
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

  for (const method of GIT_METHODS) {
    client[method] = spy(async (...args) => {
      calls.push({ method, args });
      if (method in responses) return responses[method];
      if (method === "revListCount" || method === "aheadCount") return 0;
      if (
        method === "status" ||
        method === "configGet" ||
        method === "remoteGetUrl"
      ) {
        return "";
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    });
  }

  client.withAuth = spy((token) => {
    calls.push({ method: "withAuth", args: [token] });
    return client;
  });

  return client;
}
