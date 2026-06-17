import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTestRuntime, createMockFs } from "@forwardimpact/libmock";
import { WikiSync, WikiPullConflict } from "../src/wiki-sync.js";
import { WIKI, HEALTHY_ANCESTRY, make } from "./wiki-sync-harness.js";

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
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
        introducedByFile: new Map([["MEMORY.md", "clean content"]]),
      },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, {
      pushed: true,
      reason: "pushed",
      detections: [],
    });
    assert.deepEqual(flowMethods(), [
      "isMidMerge",
      "status",
      "commitAll",
      "revListCount",
      "fetch",
      "rebase",
      "introducedByFile",
      "diffRange",
      "push",
    ]);
  });

  test("commitAndPush with paths scopes the status check and commit", async () => {
    const { git, wikiSync, flowMethods } = make({
      responses: {
        ...HEALTHY_ANCESTRY,
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
        introducedByFile: new Map([["MEMORY.md", "clean content"]]),
      },
    });
    const result = await wikiSync.commitAndPush("wiki: claim x", ["MEMORY.md"]);
    assert.deepEqual(result, {
      pushed: true,
      reason: "pushed",
      detections: [],
    });
    assert.deepEqual(flowMethods(), [
      "isMidMerge",
      "status",
      "commitPaths",
      "revListCount",
      "fetch",
      "rebase",
      "introducedByFile",
      "diffRange",
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
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
        introducedByFile: new Map(),
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
        isMidMerge: false,
        status: { stdout: "", stderr: "", exitCode: 0 },
        revListCount: 0,
      },
    });
    const result = await wikiSync.commitAndPush("wiki: claim x", ["MEMORY.md"]);
    assert.deepEqual(result, {
      pushed: false,
      reason: "clean",
      detections: [],
    });
    assert.deepEqual(flowMethods(), ["isMidMerge", "status", "revListCount"]);
  });

  test("commitAndPush is a no-op on a clean tree with nothing ahead", async () => {
    const { wikiSync, flowMethods } = make({
      responses: {
        ...HEALTHY_ANCESTRY,
        isMidMerge: false,
        status: { stdout: "", stderr: "", exitCode: 0 },
        revListCount: 0,
      },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, {
      pushed: false,
      reason: "clean",
      detections: [],
    });
    assert.deepEqual(flowMethods(), ["isMidMerge", "status", "revListCount"]);
  });

  test("commitAndPush recovers via merge -X ours when the rebase fails", async () => {
    const { wikiSync, flowMethods } = make({
      responses: {
        ...HEALTHY_ANCESTRY,
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 1, stderr: "CONFLICT" },
        mergeOursStrategy: { exitCode: 0, stderr: "" },
        revListCount: 1,
        introducedByFile: new Map(),
      },
    });
    await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(flowMethods(), [
      "isMidMerge",
      "status",
      "commitAll",
      "revListCount",
      "fetch",
      "rebase",
      "rebaseAbort",
      "mergeOursStrategy",
      "introducedByFile",
      "diffRange",
      "push",
    ]);
  });

  test("registered op re-applies on rebase conflict instead of merging textually", async () => {
    const fsSync = createMockFs({ [`${WIKI}/MEMORY.md`]: "tip content\n" });
    const { wikiSync, methods } = make({
      fsSync,
      responses: {
        ...HEALTHY_ANCESTRY,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 1, stderr: "CONFLICT" },
        revListCount: 1,
      },
    });
    const reapply = (fresh) => `${fresh}| me | t | b | — | d | e |\n`;
    const result = await wikiSync.commitAndPush(
      "wiki: claim t",
      ["MEMORY.md"],
      {
        reapply,
      },
    );
    assert.deepEqual(result, { pushed: true, reason: "reapplied" });
    const seq = methods();
    // The conflict path re-applies; it never calls mergeOursStrategy.
    assert.ok(seq.includes("resetSoft"));
    assert.ok(seq.includes("checkoutPaths"));
    assert.ok(seq.includes("commitPaths"));
    assert.ok(!seq.includes("mergeOursStrategy"));
    // The re-derived row landed on the tip's content (no textual merge).
    assert.match(
      fsSync.readFileSync(`${WIKI}/MEMORY.md`, "utf-8"),
      /tip content/,
    );
    assert.match(
      fsSync.readFileSync(`${WIKI}/MEMORY.md`, "utf-8"),
      /\| me \| t \|/,
    );
  });

  test("re-apply returning null is an already-satisfied no-op (criterion 3)", async () => {
    const fsSync = createMockFs({
      [`${WIKI}/MEMORY.md`]: "tip already has it\n",
    });
    const { wikiSync, methods } = make({
      fsSync,
      responses: {
        ...HEALTHY_ANCESTRY,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 1, stderr: "CONFLICT" },
        revListCount: 1,
      },
    });
    const result = await wikiSync.commitAndPush(
      "wiki: claim t",
      ["MEMORY.md"],
      {
        reapply: () => null,
      },
    );
    assert.deepEqual(result, { pushed: false, reason: "already-satisfied" });
    // Only the initial pre-conflict commit; the loop makes no second commit.
    assert.equal(methods().filter((m) => m === "commitPaths").length, 1);
  });

  test("a rejected push drives a bounded re-apply retry, then succeeds", async () => {
    const fsSync = createMockFs({ [`${WIKI}/MEMORY.md`]: "tip\n" });
    const { wikiSync, git } = make({
      fsSync,
      responses: {
        ...HEALTHY_ANCESTRY,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 1, stderr: "CONFLICT" },
        revListCount: 1,
        // push: reject round 1, succeed round 2.
        push: [{ throw: "rejected" }, { stdout: "", stderr: "", exitCode: 0 }],
      },
    });
    const result = await wikiSync.commitAndPush(
      "wiki: claim t",
      ["MEMORY.md"],
      {
        reapply: (fresh) => `${fresh}row\n`,
      },
    );
    assert.deepEqual(result, { pushed: true, reason: "reapplied" });
    const pushCalls = git.calls.filter((c) => c.method === "push").length;
    assert.equal(pushCalls, 2, "pushed once per round until it landed");
  });

  test("bound exhaustion fails loud with WikiSyncConflict", async () => {
    const fsSync = createMockFs({ [`${WIKI}/MEMORY.md`]: "tip\n" });
    const { wikiSync } = make({
      fsSync,
      responses: {
        ...HEALTHY_ANCESTRY,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 1, stderr: "CONFLICT" },
        revListCount: 1,
        push: { throw: "rejected" }, // rejected on every round
      },
    });
    await assert.rejects(
      wikiSync.commitAndPush("wiki: claim t", ["MEMORY.md"], {
        reapply: (fresh) => `${fresh}row\n`,
        maxReapply: 2,
      }),
      /wiki sync conflict/,
    );
  });

  test("an auth/network push failure is not contention: it rethrows, not loops", async () => {
    const fsSync = createMockFs({ [`${WIKI}/MEMORY.md`]: "tip\n" });
    const { wikiSync, git } = make({
      fsSync,
      responses: {
        ...HEALTHY_ANCESTRY,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 1, stderr: "CONFLICT" },
        revListCount: 1,
        // A credential failure — not a non-fast-forward rejection.
        push: { throw: "could not read Username: terminal prompts disabled" },
      },
    });
    await assert.rejects(
      wikiSync.commitAndPush("wiki: claim t", ["MEMORY.md"], {
        reapply: (fresh) => `${fresh}row\n`,
        maxReapply: 3,
      }),
      /could not read Username/,
    );
    // The auth failure rethrew on the first push — it did not burn the budget.
    assert.equal(
      git.calls.filter((c) => c.method === "push").length,
      1,
      "auth failure must not retry across rounds",
    );
  });

  test("a conflict without a reapply keeps the mergeOursStrategy floor", async () => {
    const fsSync = createMockFs({ [`${WIKI}/MEMORY.md`]: "tip\n" });
    const { wikiSync, methods } = make({
      fsSync,
      responses: {
        ...HEALTHY_ANCESTRY,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 1, stderr: "CONFLICT" },
        revListCount: 1,
      },
    });
    // No reapply: the no-intent path is byte-unchanged from today.
    await wikiSync.commitAndPush("wiki: update", ["MEMORY.md"]);
    const seq = methods();
    assert.ok(seq.includes("mergeOursStrategy"));
    assert.ok(!seq.includes("resetSoft"));
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
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
        introducedByFile: new Map(),
      },
    });
    git.push = async () => {
      throw new Error("could not read Username (no credentials)");
    };
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, {
      pushed: true,
      reason: "pushed",
      detections: [],
    });
  });

  // -- spec 1890 publish guards (criteria 7–11) --

  const MARKER_ADDED = [
    "<<<<<<< HEAD",
    "ours",
    "=======",
    "x",
    ">>>>>>> y",
  ].join("\n");

  test("C7: refuses mid-merge before staging or committing", async () => {
    const { wikiSync, methods } = make({
      responses: { isMidMerge: true },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, { pushed: false, reason: "mid-merge" });
    const m = methods();
    assert.deepEqual(m, ["isMidMerge"]);
    assert.ok(!m.includes("commitAll"));
    assert.ok(!m.includes("push"));
  });

  test("C8: aborts and refuses when the ours-strategy fallback conflicts", async () => {
    const { wikiSync, methods } = make({
      responses: {
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 1, stderr: "CONFLICT" },
        mergeOursStrategy: { exitCode: 1, stderr: "CONFLICT" },
        revListCount: 1,
      },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, {
      pushed: false,
      reason: "stranded-merge",
      workAt: "stash",
    });
    const m = methods();
    assert.ok(m.includes("mergeAbort"));
    assert.ok(!m.includes("push"));
  });

  test("C9: refuses to push commits introducing a conflict block; commits stay local", async () => {
    const { wikiSync, methods } = make({
      responses: {
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
        introducedByFile: new Map([["staff-engineer.md", MARKER_ADDED]]),
      },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, {
      pushed: false,
      reason: "would-publish-markers",
    });
    const m = methods();
    assert.ok(m.includes("commitAll"), "the commit is kept local");
    assert.ok(!m.includes("push"));
  });

  test("C9: dual-lineage — each push attempt is refused independently (stateless)", async () => {
    const lane = (added) =>
      make({
        responses: {
          isMidMerge: false,
          status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
          rebase: { exitCode: 0, stderr: "" },
          revListCount: 1,
          introducedByFile: new Map([["staff-engineer.md", added]]),
        },
      });
    const a = lane(MARKER_ADDED);
    const b = lane(MARKER_ADDED);
    const ra = await a.wikiSync.commitAndPush("wiki: lane a");
    const rb = await b.wikiSync.commitAndPush("wiki: lane b");
    assert.equal(ra.reason, "would-publish-markers");
    assert.equal(rb.reason, "would-publish-markers");
  });

  test("C9: an unrelated writer with a clean added side still pushes", async () => {
    const { wikiSync } = make({
      responses: {
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
        // Pre-existing origin corruption is on the base side, never the added
        // side, so introducedByFile is clean for this writer.
        introducedByFile: new Map([["staff-engineer.md", "added clean line"]]),
      },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, { pushed: true, reason: "pushed" });
  });

  test("C9: STATUS.md markers fire on the push path (not fence-exempt)", async () => {
    const statusAdded = [
      "```",
      "<<<<<<< HEAD",
      "=======",
      ">>>>>>> y",
      "```",
    ].join("\n");
    const { wikiSync } = make({
      responses: {
        isMidMerge: false,
        status: { stdout: " M STATUS.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
        introducedByFile: new Map([["STATUS.md", statusAdded]]),
      },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, {
      pushed: false,
      reason: "would-publish-markers",
    });
  });

  test("C10: clean tree with clean introduced diff syncs exactly as today", async () => {
    const { wikiSync, methods } = make({
      responses: {
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
        introducedByFile: new Map([["MEMORY.md", "ordinary added prose"]]),
      },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, { pushed: true, reason: "pushed" });
    assert.ok(methods().includes("push"));
  });

  test("C11: introduced scan resolves shallow without deepening; a throw refuses", async () => {
    const ok = make({
      responses: {
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
        introducedByFile: new Map([["MEMORY.md", "added line"]]),
      },
    });
    const okResult = await ok.wikiSync.commitAndPush("wiki: update");
    assert.equal(okResult.pushed, true);
    // No clone/deepen on the normal path — the diff decides from in-clone state.
    assert.ok(!ok.methods().includes("clone"));

    const thrown = make({
      responses: {
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
      },
    });
    thrown.git.introducedByFile = async () => {
      throw new Error("fatal: bad revision 'origin/master..HEAD'");
    };
    const thrownResult = await thrown.wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(thrownResult, {
      pushed: false,
      reason: "introduced-scan-failed",
    });
    assert.notEqual(thrownResult.pushed, true);
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
