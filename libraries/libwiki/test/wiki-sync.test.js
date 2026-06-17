import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createTestRuntime,
  createMockGitClient,
  createMockFs,
} from "@forwardimpact/libmock";
import {
  AncestryRefusal,
  WikiSync,
  WikiPullConflict,
} from "../src/wiki-sync.js";

const WIKI = "/repo/wiki";
const PARENT = "/repo";

// Mock responses placing the clone in a healthy, publishable ancestry state:
// HEAD on `master`, the remote-tracking ref and HEAD both resolve, and a
// merge-base exists — so #assertPublishable allows on the local-only path.
const HEALTHY_ANCESTRY = {
  headBranch: "master",
  refExists: true,
  mergeBaseExists: true,
};

// Git methods the ancestry guard issues; filtered out of flow-sequence
// assertions that care only about the commit/rebase/push flow.
const GUARD_METHODS = new Set([
  "headBranch",
  "refExists",
  "mergeBaseExists",
  "remoteBranchExists",
  "fetchDeepen",
]);

function make({ responses, fsSync, resolveToken } = {}) {
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

describe("WikiSync", () => {
  test("constructor rejects a missing gitClient", () => {
    assert.throws(
      () => new WikiSync({ runtime: createTestRuntime(), wikiDir: WIKI }),
      /gitClient is required/,
    );
  });

  test("isCloned reads fsSync.existsSync for the .git directory", () => {
    const present = make({ fsSync: createMockFs({ [`${WIKI}/.git`]: "" }) });
    assert.equal(present.wikiSync.isCloned(), true);
    const absent = make({ fsSync: createMockFs({}) });
    assert.equal(absent.wikiSync.isCloned(), false);
  });

  test("ensureCloned clones when the directory is empty", async () => {
    const { wikiSync, methods } = make({ fsSync: createMockFs({}) });
    const result = await wikiSync.ensureCloned("https://example/x.wiki.git");
    assert.deepEqual(result, { cloned: true, reason: "cloned" });
    assert.deepEqual(methods(), ["clone"]);
  });

  test("ensureCloned is a no-op when already cloned", async () => {
    const { wikiSync, methods } = make({
      fsSync: createMockFs({ [`${WIKI}/.git`]: "" }),
    });
    const result = await wikiSync.ensureCloned("https://example/x.wiki.git");
    assert.deepEqual(result, { cloned: true, reason: "already-cloned" });
    assert.deepEqual(methods(), []);
  });

  test("inheritIdentity reads parent config and writes wiki config", async () => {
    const { git, wikiSync } = make({
      responses: { configGet: "Parent Name" },
    });
    await wikiSync.inheritIdentity();
    const sets = git.calls.filter((c) => c.method === "configSet");
    assert.equal(sets.length, 2);
    assert.deepEqual(sets[0].args, ["user.name", "Parent Name", { cwd: WIKI }]);
  });

  test("pull fetches then rebases cleanly", async () => {
    const { wikiSync, methods } = make({
      responses: { rebase: { exitCode: 0, stderr: "" } },
    });
    await wikiSync.pull();
    assert.deepEqual(methods(), ["fetch", "rebase"]);
  });

  test("pull aborts and throws WikiPullConflict when the rebase fails", async () => {
    const { wikiSync, methods } = make({
      responses: { rebase: { exitCode: 1, stderr: "CONFLICT" } },
    });
    await assert.rejects(
      () => wikiSync.pull(),
      (err) => {
        assert.ok(err instanceof WikiPullConflict);
        assert.equal(err.stderr, "CONFLICT");
        return true;
      },
    );
    assert.deepEqual(methods(), ["fetch", "rebase", "rebaseAbort"]);
  });

  test("commitAndPush commits, rebases, and pushes a dirty ahead tree", async () => {
    const { wikiSync, flowMethods } = make({
      responses: {
        ...HEALTHY_ANCESTRY,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
      },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, { pushed: true, reason: "pushed" });
    assert.deepEqual(flowMethods(), [
      "status",
      "commitAll",
      "revListCount",
      "fetch",
      "rebase",
      "push",
    ]);
  });

  test("commitAndPush with paths scopes the status check and commit", async () => {
    const { git, wikiSync, flowMethods } = make({
      responses: {
        ...HEALTHY_ANCESTRY,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
      },
    });
    const result = await wikiSync.commitAndPush("wiki: claim x", ["MEMORY.md"]);
    assert.deepEqual(result, { pushed: true, reason: "pushed" });
    assert.deepEqual(flowMethods(), [
      "status",
      "commitPaths",
      "revListCount",
      "fetch",
      "rebase",
      "push",
    ]);
    const status = git.calls.find((c) => c.method === "status");
    assert.deepEqual(status.args, [{ cwd: WIKI, paths: ["MEMORY.md"] }]);
    const commit = git.calls.find((c) => c.method === "commitPaths");
    assert.deepEqual(commit.args, [
      "wiki: claim x",
      ["MEMORY.md"],
      { cwd: WIKI },
    ]);
  });

  test("commitAndPush rebases with autostash so foreign dirt survives the pull", async () => {
    const { git, wikiSync } = make({
      responses: {
        ...HEALTHY_ANCESTRY,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
      },
    });
    await wikiSync.commitAndPush("wiki: claim x", ["MEMORY.md"]);
    const rebase = git.calls.find((c) => c.method === "rebase");
    assert.deepEqual(rebase.args, [
      "origin/master",
      { cwd: WIKI, autostash: true },
    ]);
  });

  test("commitAndPush with paths is a no-op when only foreign files are dirty", async () => {
    const { wikiSync, flowMethods } = make({
      responses: {
        ...HEALTHY_ANCESTRY,
        status: { stdout: "", stderr: "", exitCode: 0 },
        revListCount: 0,
      },
    });
    const result = await wikiSync.commitAndPush("wiki: claim x", ["MEMORY.md"]);
    assert.deepEqual(result, { pushed: false, reason: "clean" });
    assert.deepEqual(flowMethods(), ["status", "revListCount"]);
  });

  test("commitAndPush is a no-op on a clean tree with nothing ahead", async () => {
    const { wikiSync, flowMethods } = make({
      responses: {
        ...HEALTHY_ANCESTRY,
        status: { stdout: "", stderr: "", exitCode: 0 },
        revListCount: 0,
      },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, { pushed: false, reason: "clean" });
    assert.deepEqual(flowMethods(), ["status", "revListCount"]);
  });

  test("commitAndPush recovers via merge -X ours when the rebase fails", async () => {
    const { wikiSync, flowMethods } = make({
      responses: {
        ...HEALTHY_ANCESTRY,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 1, stderr: "CONFLICT" },
        revListCount: 1,
      },
    });
    await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(flowMethods(), [
      "status",
      "commitAll",
      "revListCount",
      "fetch",
      "rebase",
      "rebaseAbort",
      "mergeOursStrategy",
      "push",
    ]);
  });

  test("network operations resolve and thread the token; local ones do not", async () => {
    let calls = 0;
    const { git, wikiSync } = make({
      responses: { status: { stdout: "", stderr: "", exitCode: 0 } },
      resolveToken: () => {
        calls++;
        return "ghp_token";
      },
    });
    await wikiSync.isClean();
    assert.equal(calls, 0, "isClean must not resolve a token");
    await wikiSync.fetch();
    assert.equal(calls, 1, "fetch must resolve a token");
    assert.deepEqual(git.calls.at(-2), {
      method: "withAuth",
      args: ["ghp_token"],
    });
  });

  test("commitAndPush tolerates a failing push (WikiRepo fire-and-forget)", async () => {
    const { git, wikiSync } = make({
      responses: {
        ...HEALTHY_ANCESTRY,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
      },
    });
    git.push = async () => {
      throw new Error("could not read Username (no credentials)");
    };
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, { pushed: true, reason: "pushed" });
  });

  test("pull tolerates a failing fetch and still rebases", async () => {
    const { git, wikiSync } = make({
      responses: { rebase: { exitCode: 0, stderr: "" } },
    });
    git.fetch = async () => {
      throw new Error("could not read Username (no credentials)");
    };
    await wikiSync.pull(); // must not throw
  });

  test("resolveToken throws propagate through network operations", async () => {
    const { wikiSync } = make({
      resolveToken: () => {
        throw new Error("not configured");
      },
    });
    await assert.rejects(() => wikiSync.fetch(), /not configured/);
  });
});

describe("WikiSync ancestry guard", () => {
  // A dirty, ahead tree so the guard, not the no-op gate, decides the outcome.
  const DIRTY_AHEAD = {
    status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
    rebase: { exitCode: 0, stderr: "" },
    revListCount: 1,
  };

  function assertNoWrite(git) {
    const wrote = git.calls.find((c) =>
      ["commitAll", "commitPaths", "push"].includes(c.method),
    );
    assert.equal(wrote, undefined, "guard must not commit or push on refusal");
  }

  test("detached HEAD ⇒ unverifiable refusal, no commit or push", async () => {
    const { git, wikiSync } = make({
      responses: { ...DIRTY_AHEAD, headBranch: "", refExists: true },
    });
    await assert.rejects(
      () => wikiSync.commitAndPush("wiki: update"),
      (err) => err instanceof AncestryRefusal && err.kind === "unverifiable",
    );
    assertNoWrite(git);
  });

  test("unborn HEAD against an existing remote branch ⇒ unrelated refusal", async () => {
    const { git, wikiSync } = make({
      responses: {
        ...DIRTY_AHEAD,
        headBranch: "master",
        // origin/master resolves (branch present); HEAD does not (unborn).
        refExists: false,
        remoteBranchExists: true,
      },
    });
    // refExists is false for both origin/master and HEAD here, so the remote
    // probe runs and confirms the branch is present, then unborn HEAD refuses.
    await assert.rejects(
      () => wikiSync.commitAndPush("wiki: update"),
      (err) => err instanceof AncestryRefusal && err.kind === "unrelated",
    );
    assertNoWrite(git);
  });

  test("severed history on a complete clone ⇒ unrelated refusal", async () => {
    const { git, wikiSync } = make({
      responses: {
        ...DIRTY_AHEAD,
        headBranch: "master",
        refExists: true,
        mergeBaseExists: false,
      },
      fsSync: createMockFs({}), // no .git/shallow ⇒ complete clone
    });
    await assert.rejects(
      () => wikiSync.commitAndPush("wiki: update"),
      (err) => err instanceof AncestryRefusal && err.kind === "unrelated",
    );
    assertNoWrite(git);
  });

  test("clean tree with committed unverifiable history ⇒ refusal at the push half", async () => {
    // Clean tree (nothing to commit) but ahead of the remote: only the
    // second #assertPublishable, before the push, can catch this.
    const { git, wikiSync } = make({
      responses: {
        status: { stdout: "", stderr: "", exitCode: 0 },
        revListCount: 1,
        headBranch: "master",
        refExists: true,
        mergeBaseExists: false,
      },
      fsSync: createMockFs({}),
    });
    await assert.rejects(
      () => wikiSync.commitAndPush("wiki: update"),
      (err) => err instanceof AncestryRefusal && err.kind === "unrelated",
    );
    const pushed = git.calls.find((c) => c.method === "push");
    assert.equal(pushed, undefined, "no push on a push-half refusal");
  });

  test("shallow clone, ancestry within window ⇒ allowed, no deepening fetch", async () => {
    const { git, wikiSync } = make({
      responses: { ...DIRTY_AHEAD, ...HEALTHY_ANCESTRY },
      fsSync: createMockFs({ [`${WIKI}/.git/shallow`]: "" }),
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, { pushed: true, reason: "pushed" });
    const deepen = git.calls.find((c) => c.method === "fetchDeepen");
    assert.equal(deepen, undefined, "no deepen when the merge-base resolves");
  });

  test("shallow clone, ancestry outside window ⇒ deepen then allow", async () => {
    const git = createMockGitClient({
      responses: { ...DIRTY_AHEAD, headBranch: "master", refExists: true },
    });
    // First merge-base check fails (outside window); after the deepen it passes.
    let mergeBaseCalls = 0;
    git.mergeBaseExists = async () => {
      mergeBaseCalls++;
      return mergeBaseCalls > 1;
    };
    git.fetchDeepen = async () => ({ stdout: "", stderr: "", exitCode: 0 });
    const runtime = createTestRuntime({
      fsSync: createMockFs({ [`${WIKI}/.git/shallow`]: "" }),
    });
    const wikiSync = new WikiSync({
      runtime,
      gitClient: git,
      wikiDir: WIKI,
      parentDir: PARENT,
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, { pushed: true, reason: "pushed" });
  });

  // Captures the two shallow-clone refusal messages so the test below can
  // assert their text differs (spec criterion 7: the could-not-verify error
  // must read differently from the confirmed-unrelated refusal).
  async function shallowRefusal(fetchDeepen) {
    const { git, wikiSync } = make({
      responses: {
        ...DIRTY_AHEAD,
        headBranch: "master",
        refExists: true,
        mergeBaseExists: false,
        fetchDeepen,
      },
      fsSync: createMockFs({ [`${WIKI}/.git/shallow`]: "" }),
    });
    let caught;
    await assert.rejects(
      () => wikiSync.commitAndPush("wiki: update"),
      (err) => {
        caught = err;
        return err instanceof AncestryRefusal;
      },
    );
    assertNoWrite(git);
    return caught;
  }

  test("shallow clone, deeper verification still unrelated ⇒ unrelated refusal", async () => {
    const err = await shallowRefusal({ stdout: "", stderr: "", exitCode: 0 });
    assert.equal(err.kind, "unrelated");
  });

  test("shallow clone, deepening fetch fails ⇒ unverifiable refusal, distinct text", async () => {
    const confirmed = await shallowRefusal({
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    const couldNotVerify = await shallowRefusal({
      stdout: "",
      stderr: "no network",
      exitCode: 1,
    });
    assert.equal(couldNotVerify.kind, "unverifiable");
    assert.notEqual(
      couldNotVerify.message,
      confirmed.message,
      "could-not-verify text must differ from confirmed-unrelated",
    );
  });

  test("genuinely empty remote with positive evidence ⇒ first commit accepted", async () => {
    const { wikiSync } = make({
      responses: {
        ...DIRTY_AHEAD,
        headBranch: "master",
        refExists: false, // origin/master does not resolve
        remoteBranchExists: false, // probe confirms the remote is empty
      },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, { pushed: true, reason: "pushed" });
  });

  test("absent tracking ref and unobservable remote ⇒ unverifiable refusal", async () => {
    const git = createMockGitClient({
      responses: { ...DIRTY_AHEAD, headBranch: "master", refExists: false },
    });
    git.remoteBranchExists = async () => {
      throw new Error("could not read Username");
    };
    const runtime = createTestRuntime();
    const wikiSync = new WikiSync({
      runtime,
      gitClient: git,
      wikiDir: WIKI,
      parentDir: PARENT,
    });
    await assert.rejects(
      () => wikiSync.commitAndPush("wiki: update"),
      (err) => err instanceof AncestryRefusal && err.kind === "unverifiable",
    );
    assertNoWrite(git);
  });

  test("absent tracking ref, observable, shared ancestry ⇒ allowed", async () => {
    // origin/master does not resolve locally; the probe finds the branch
    // present; HEAD resolves and shares a merge-base ⇒ allow. The guard must
    // first fetch the branch into the tracking ref, because merge-base is
    // judged against the probed branch tip, not an unresolvable ref (the path
    // real git would otherwise reject).
    const git = createMockGitClient({
      responses: {
        ...DIRTY_AHEAD,
        headBranch: "master",
        remoteBranchExists: true,
      },
    });
    // Model real git: origin/master resolves only after the branch is fetched
    // into the tracking ref, and merge-base resolves only once it does.
    let trackingFetched = false;
    git.refExists = async (ref) =>
      ref === "HEAD" || (ref === "origin/master" && trackingFetched);
    git.fetch = async (remote, refspec) => {
      git.calls.push({ method: "fetch", args: [remote, refspec] });
      if (refspec === "master:refs/remotes/origin/master")
        trackingFetched = true;
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    git.mergeBaseExists = async (a) =>
      a === "origin/master" ? trackingFetched : false;
    const runtime = createTestRuntime();
    const wikiSync = new WikiSync({
      runtime,
      gitClient: git,
      wikiDir: WIKI,
      parentDir: PARENT,
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, { pushed: true, reason: "pushed" });
    const trackingFetch = git.calls.find(
      (c) =>
        c.method === "fetch" &&
        c.args?.[1] === "master:refs/remotes/origin/master",
    );
    assert.ok(
      trackingFetch,
      "must fetch the probed branch into the tracking ref before judging merge-base",
    );
  });

  test("absent tracking ref, observable, but tracking fetch fails ⇒ unverifiable refusal", async () => {
    const git = createMockGitClient({
      responses: {
        ...DIRTY_AHEAD,
        headBranch: "master",
        remoteBranchExists: true,
      },
    });
    git.refExists = async (ref) => ref === "HEAD";
    git.fetch = async (_remote, refspec) => {
      if (refspec === "master:refs/remotes/origin/master")
        throw new Error("fetch failed");
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const runtime = createTestRuntime();
    const wikiSync = new WikiSync({
      runtime,
      gitClient: git,
      wikiDir: WIKI,
      parentDir: PARENT,
    });
    await assert.rejects(
      () => wikiSync.commitAndPush("wiki: update"),
      (err) => err instanceof AncestryRefusal && err.kind === "unverifiable",
    );
    assertNoWrite(git);
  });

  test("healthy hot path issues no ls-remote and no deepening fetch", async () => {
    const { git, wikiSync } = make({
      responses: { ...DIRTY_AHEAD, ...HEALTHY_ANCESTRY },
    });
    await wikiSync.commitAndPush("wiki: update");
    const names = git.calls.map((c) => c.method);
    assert.ok(
      !names.includes("remoteBranchExists"),
      "hot path adds no remote round-trip",
    );
    assert.ok(!names.includes("fetchDeepen"), "hot path adds no deepening");
  });
});
