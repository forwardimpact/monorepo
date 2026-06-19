import { createTestRuntime, createMockGitClient } from "@forwardimpact/libmock";
import { WikiSync } from "../src/wiki-sync.js";

export const WIKI = "/repo/wiki";
export const PARENT = "/repo";

// Mock responses placing the clone in a healthy, publishable ancestry state:
// HEAD on `master`, the remote-tracking ref and HEAD both resolve, and a
// merge-base exists — so #assertPublishable allows on the local-only path.
export const HEALTHY_ANCESTRY = {
  headBranch: "master",
  refExists: true,
  mergeBaseExists: true,
};

// Git methods the ancestry guard issues; filtered out of flow-sequence
// assertions that care only about the commit/rebase/push flow.
export const GUARD_METHODS = new Set([
  "headBranch",
  "refExists",
  "mergeBaseExists",
  "remoteBranchExists",
  "fetchDeepen",
]);

/** Build a WikiSync over a mock git client and runtime for unit tests. */
export function make({ responses, fsSync, resolveToken } = {}) {
  const git = createMockGitClient({ responses });
  const runtime = createTestRuntime(fsSync ? { fsSync } : {});
  const wikiSync = new WikiSync({
    runtime,
    gitClient: git,
    wikiDir: WIKI,
    parentDir: PARENT,
    resolveToken,
  });
  return {
    git,
    wikiSync,
    methods: () => git.calls.map((c) => c.method),
    flowMethods: () =>
      git.calls.map((c) => c.method).filter((m) => !GUARD_METHODS.has(m)),
  };
}
