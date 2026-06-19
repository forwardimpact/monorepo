import {
  createTestRuntime,
  createMockGitClient,
  createMockProcess,
} from "@forwardimpact/libmock";
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

/** A remote tip the healthy push lands onto. */
export const REMOTE_TIP = "aaaa111";

// Mock responses placing the clone in a healthy, publishable PUSH state for the
// honest commitAndPush (the honest commitAndPush contract). It folds in HEALTHY_ANCESTRY because the
// composed flow always runs the ancestry guard (the ancestry guard) before the push, so
// a push-focused test still needs `headBranch`/`refExists`/`mergeBaseExists`
// satisfied. Adds: a remote tip the push lands onto, HEAD not yet contained (so
// not nothing-to-push), no unmerged paths, no foreign drops, and an accepted
// per-ref push report. `isAncestor` defaults false (the nothing-to-push check
// `isAncestor("HEAD", tip)`); conservation's `isAncestor(tip, "HEAD")` only
// runs when `diffNameStatus` reports a drop, so healthy-landing tests (empty
// diff) never reach it. `isMidMerge` defaults absent (falsy ⇒ not mid-merge).
export const HEALTHY_PUSH = {
  ...HEALTHY_ANCESTRY,
  isMidMerge: false,
  remoteRefTip: REMOTE_TIP,
  isAncestor: false,
  statusPorcelain: { stdout: "", stderr: "", exitCode: 0 },
  diffNameStatus: "",
  showFile: null,
  introducedByFile: new Map(),
  pushPorcelain: {
    stdout: "=\trefs/heads/master:refs/heads/master\t[up to date]\n",
    stderr: "",
    exitCode: 0,
  },
};

/** Alias of the full healthy push+ancestry state (HEALTHY_PUSH folds ancestry). */
export const HEALTHY = HEALTHY_PUSH;

// Git methods the ancestry guard issues; filtered out of flow-sequence
// assertions that care only about the commit/rebase/push flow.
export const GUARD_METHODS = new Set([
  "headBranch",
  "refExists",
  "mergeBaseExists",
  "remoteBranchExists",
  "fetchDeepen",
]);

/**
 * A `runtime.subprocess` that gives the secret gate distinct verdicts for its
 * `gitleaks version` probe and `gitleaks detect` scan (the libmock subprocess
 * keys responses by command name only, so the two `gitleaks` calls collide).
 * `version`/`detect` exit codes default to clean.
 */
export function gateSubprocess({ version = 0, detect = 0, report = "" } = {}) {
  return {
    run: async (_cmd, args = []) =>
      args[0] === "version"
        ? { stdout: "", stderr: "", exitCode: version, signal: null }
        : { stdout: report, stderr: "", exitCode: detect, signal: null },
    runSync: () => ({ stdout: "", stderr: "", exitCode: 0 }),
    spawn: () => ({}),
  };
}

/** Build a WikiSync over a mock git client and runtime for unit tests. */
export function make({
  responses,
  fsSync,
  resolveToken,
  subprocess,
  env,
} = {}) {
  const git = createMockGitClient({ responses });
  const runtime = createTestRuntime({
    ...(fsSync ? { fsSync } : {}),
    ...(subprocess ? { subprocess } : {}),
    // Build a full mock proc carrying the custom env so capturing
    // stdout/stderr stay available (the conservation self-report writes to
    // proc.stderr — the honest commitAndPush contract).
    ...(env ? { proc: createMockProcess({ env }) } : {}),
  });
  const wikiSync = new WikiSync({
    runtime,
    gitClient: git,
    wikiDir: WIKI,
    parentDir: PARENT,
    resolveToken,
  });
  return {
    git,
    runtime,
    wikiSync,
    methods: () => git.calls.map((c) => c.method),
    flowMethods: () =>
      git.calls.map((c) => c.method).filter((m) => !GUARD_METHODS.has(m)),
    stderr: () => runtime.proc.stderr.chunks.join(""),
  };
}
