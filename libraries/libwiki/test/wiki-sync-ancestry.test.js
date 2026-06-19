import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createTestRuntime,
  createMockGitClient,
  createMockFs,
} from "@forwardimpact/libmock";
import { AncestryRefusal, WikiSync } from "../src/wiki-sync.js";
import {
  WIKI,
  PARENT,
  HEALTHY_ANCESTRY,
  HEALTHY_PUSH,
  make,
} from "./wiki-sync-harness.js";

describe("WikiSync ancestry guard", () => {
  // A dirty, ahead tree so the guard, not the no-op gate, decides the outcome.
  // `isMidMerge: false` so the mid-merge guard does not short-circuit before the
  // ancestry guard under test. Folds in the honest push-flow responses
  // (HEALTHY_PUSH) so the allow-path tests reach a grounded landing under the
  // the honest commitAndPush contract composed flow.
  const DIRTY_AHEAD = {
    ...HEALTHY_PUSH,
    isMidMerge: false,
    status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
    rebase: { exitCode: 0, stderr: "" },
    // Clean introduced diff so the publish-marker guard (Guard 3) lets the
    // allow-path tests reach the push the ancestry guard is gating.
    introducedByFile: new Map(),
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
        isMidMerge: false,
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
    assert.deepEqual(result, {
      landed: true,
      reason: "landed",
      detections: [],
    });
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
    assert.deepEqual(result, {
      landed: true,
      reason: "landed",
      detections: [],
    });
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
    assert.deepEqual(result, {
      landed: true,
      reason: "landed",
      detections: [],
    });
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
    assert.deepEqual(result, {
      landed: true,
      reason: "landed",
      detections: [],
    });
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

  test("healthy hot path issues no ancestry remote-branch probe and no deepening fetch", async () => {
    const { git, wikiSync } = make({
      responses: { ...DIRTY_AHEAD, ...HEALTHY_ANCESTRY },
    });
    await wikiSync.commitAndPush("wiki: update");
    const names = git.calls.map((c) => c.method);
    // The ancestry guard's emptiness probe (`remoteBranchExists`) and the
    // shallow-clone deepen stay off the hot path. The grounded nothing-to-push
    // read (`remoteRefTip`) is a separate, expected round-trip (the grounded-outcome contract).
    assert.ok(
      !names.includes("remoteBranchExists"),
      "hot path adds no ancestry-probe round-trip",
    );
    assert.ok(!names.includes("fetchDeepen"), "hot path adds no deepening");
  });
});
