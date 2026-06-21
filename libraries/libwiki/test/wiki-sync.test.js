import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTestRuntime, createMockFs } from "@forwardimpact/libmock";
import {
  WikiSync,
  WikiPullConflict,
  WikiPushFailure,
  AncestryRefusal,
  PUSH_REASONS,
} from "../src/wiki-sync.js";
import {
  WIKI,
  HEALTHY_ANCESTRY,
  HEALTHY_PUSH,
  HEALTHY,
  REMOTE_TIP,
  make,
} from "./wiki-sync-harness.js";

// A mock fsSync whose wiki already carries the metrics-CSV union declaration,
// so `commitAndPush`'s ensure-before-gate is a no-op and the git call sequence
// is byte-identical to a commit-and-push that ensures nothing. Provisioning
// behavior (the ensure writing the file) is covered in
// wiki-sync.integration.test.js against real git.
const provisionedFs = () =>
  createMockFs({
    [`${WIKI}/.gitattributes`]: "metrics/**/*.csv merge=union\n",
  });

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

  test("commitAndPush without paths commits the session's dirty set, never sweeps the whole tree (1850 D3/KD6)", async () => {
    const { git, wikiSync, methods } = make({
      fsSync: provisionedFs(),
      responses: {
        ...HEALTHY,
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        introducedByFile: new Map([["MEMORY.md", "clean content"]]),
      },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.equal(result.landed, true);
    assert.equal(result.reason, PUSH_REASONS.LANDED);
    const m = methods();
    // The bare push collects its own dirty set and commits it pathspec-scoped;
    // the whole-tree `add -A` sweep that carried the eraser never runs.
    assert.ok(!m.includes("commitAll"), "the whole-tree sweep is gone");
    const commit = git.calls.find((c) => c.method === "commitPaths");
    assert.deepEqual(commit.args, [
      "wiki: update",
      ["MEMORY.md"],
      { cwd: WIKI },
    ]);
    assert.ok(m.includes("pushPorcelain"));
    assert.ok(m.includes("isMidMerge"), "the mid-merge guard still runs");
    assert.ok(m.includes("introducedByFile"), "the marker guard still runs");
    assert.ok(!m.includes("mergeOursStrategy"), "clobber fallback is gone");
  });

  test("commitAndPush without paths returns nothing-to-push on a clean tree", async () => {
    const { wikiSync, methods } = make({
      fsSync: provisionedFs(),
      responses: {
        ...HEALTHY,
        isMidMerge: false,
        status: { stdout: "", stderr: "", exitCode: 0 },
        // Remote tip already contains HEAD ⇒ grounded nothing-to-push.
        remoteRefTip: "deadbeef",
        isAncestor: true,
      },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.equal(result.landed, false);
    assert.equal(result.reason, PUSH_REASONS.NOTHING);
    const m = methods();
    assert.ok(!m.includes("commitPaths"), "an empty dirty set commits nothing");
    assert.ok(!m.includes("commitAll"), "the whole-tree sweep is gone");
  });

  test("commitAndPush with paths scopes the status check and commit", async () => {
    const { git, wikiSync } = make({
      fsSync: provisionedFs(),
      responses: {
        ...HEALTHY,
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        introducedByFile: new Map([["MEMORY.md", "clean content"]]),
      },
    });
    const result = await wikiSync.commitAndPush("wiki: claim x", ["MEMORY.md"]);
    assert.equal(result.landed, true);
    assert.equal(result.reason, PUSH_REASONS.LANDED);
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
      fsSync: provisionedFs(),
      responses: {
        ...HEALTHY,
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
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

  test("commitAndPush reports grounded nothing-to-push when the remote contains HEAD", async () => {
    const { wikiSync, methods } = make({
      fsSync: provisionedFs(),
      responses: {
        ...HEALTHY,
        isMidMerge: false,
        status: { stdout: "", stderr: "", exitCode: 0 },
        isAncestor: true, // remote tip already contains HEAD
      },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, { landed: false, reason: PUSH_REASONS.NOTHING });
    assert.ok(
      !methods().includes("pushPorcelain"),
      "no push when grounded clean",
    );
  });

  test("stranded-resume (clean tree, ahead, stale ref) re-pushes — never nothing-to-push", async () => {
    const { wikiSync, methods } = make({
      fsSync: provisionedFs(),
      responses: {
        ...HEALTHY,
        isMidMerge: false,
        status: { stdout: "", stderr: "", exitCode: 0 }, // clean tree
        isAncestor: false, // remote does NOT contain HEAD
        rebase: { exitCode: 0, stderr: "" },
        introducedByFile: new Map(),
      },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.equal(result.landed, true);
    assert.equal(result.reason, PUSH_REASONS.LANDED);
    assert.ok(methods().includes("pushPorcelain"), "stranded tree re-pushes");
  });

  test("commitAndPush fails loud on a rebase conflict — no -X ours, remote untouched", async () => {
    const { wikiSync, methods } = make({
      fsSync: provisionedFs(),
      responses: {
        ...HEALTHY,
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 1, stderr: "CONFLICT" },
      },
    });
    await assert.rejects(
      () => wikiSync.commitAndPush("wiki: update"),
      (err) =>
        err instanceof WikiPushFailure && err.reason === PUSH_REASONS.CONFLICT,
    );
    const m = methods();
    assert.ok(m.includes("rebaseAbort"), "the rebase is aborted");
    assert.ok(!m.includes("mergeOursStrategy"), "remote side never discarded");
    assert.ok(!m.includes("pushPorcelain"), "no push on conflict");
  });

  test("commitAndPush folds .gitattributes into a scoped commit when the ensure writes it", async () => {
    // No .gitattributes in the wiki → ensure writes it → it must be appended to
    // the scoped commit pathspec so it is not autostashed aside.
    const { git, wikiSync } = make({
      fsSync: createMockFs({}),
      responses: {
        ...HEALTHY,
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        introducedByFile: new Map(),
      },
    });
    await wikiSync.commitAndPush("wiki: claim x", ["MEMORY.md"]);
    const commit = git.calls.find((c) => c.method === "commitPaths");
    assert.deepEqual(commit.args, [
      "wiki: claim x",
      ["MEMORY.md", ".gitattributes"],
      { cwd: WIKI },
    ]);
  });

  test("registered op re-applies on rebase conflict instead of merging textually", async () => {
    const fsSync = createMockFs({ [`${WIKI}/MEMORY.md`]: "tip content\n" });
    const { wikiSync, methods } = make({
      fsSync,
      responses: {
        ...HEALTHY_PUSH,
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
        ...HEALTHY_PUSH,
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
        ...HEALTHY_PUSH,
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
        ...HEALTHY_PUSH,
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
        ...HEALTHY_PUSH,
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

  test("a conflict without a reapply fails loud — the mergeOursStrategy floor is removed (1780 lands 1920's joint fail-loud)", async () => {
    const fsSync = createMockFs({ [`${WIKI}/MEMORY.md`]: "tip\n" });
    const { wikiSync, methods } = make({
      fsSync,
      responses: {
        ...HEALTHY_PUSH,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 1, stderr: "CONFLICT" },
      },
    });
    // No reapply: the silent-clobber fallback is removed, so the
    // no-intent conflict path fails loud rather than discarding the remote side.
    await assert.rejects(
      () => wikiSync.commitAndPush("wiki: update", ["MEMORY.md"]),
      (err) =>
        err instanceof WikiPushFailure && err.reason === PUSH_REASONS.CONFLICT,
    );
    const seq = methods();
    assert.ok(seq.includes("rebaseAbort"), "the rebase is aborted");
    assert.ok(!seq.includes("mergeOursStrategy"), "the clobber floor is gone");
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

  test("commitAndPush does NOT mint success on a failing push (inverted: phantom-success defect)", async () => {
    // This row formerly locked in the fire-and-forget phantom-success defect
    // (returned pushed:true regardless). Inverted to the honest contract: a push that
    // throws at transport surfaces a transport failure, never a landed success.
    const { git, wikiSync } = make({
      fsSync: provisionedFs(),
      responses: {
        ...HEALTHY,
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        introducedByFile: new Map(),
      },
    });
    git.pushPorcelain = async () => {
      throw new Error("could not read Username (no credentials)");
    };
    await assert.rejects(
      () => wikiSync.commitAndPush("wiki: update"),
      (err) =>
        err instanceof WikiPushFailure && err.reason === PUSH_REASONS.TRANSPORT,
    );
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

describe("WikiSync honest-outcome contract (the honest commitAndPush contract)", () => {
  const DIRTY = { stdout: " M MEMORY.md", stderr: "", exitCode: 0 };

  function rejectsReason(promiseFn, reason) {
    return assert.rejects(
      promiseFn,
      (err) => err instanceof WikiPushFailure && err.reason === reason,
    );
  }

  test("precondition: rebase-in-progress refuses before mutating", async () => {
    const { git, wikiSync } = make({
      responses: { ...HEALTHY_PUSH, status: DIRTY, rebase: { exitCode: 0 } },
      fsSync: createMockFs({ [`${WIKI}/.git/rebase-merge`]: "" }),
    });
    await rejectsReason(
      () => wikiSync.commitAndPush("wiki: update"),
      PUSH_REASONS.PRECONDITION,
    );
    const m = git.calls.map((c) => c.method);
    assert.ok(!m.includes("commitAll"), "no commit on a precondition refusal");
    assert.ok(
      !m.includes("pushPorcelain"),
      "no push on a precondition refusal",
    );
  });

  test("detached HEAD refuses before mutating (ancestry guard — D7 seam defers to 1750)", async () => {
    // The detached-HEAD D7 fixture collapses onto 1750's ancestry guard, which
    // refuses with an AncestryRefusal ("unverifiable") before any mutation —
    // the ancestry guard owns the reason naming for that fixture.
    const { git, wikiSync } = make({
      responses: {
        ...HEALTHY_PUSH,
        headBranch: "",
        refExists: true,
        status: DIRTY,
      },
    });
    await assert.rejects(
      () => wikiSync.commitAndPush("wiki: update"),
      (err) => err instanceof AncestryRefusal && err.kind === "unverifiable",
    );
    const m = git.calls.map((c) => c.method);
    assert.ok(!m.includes("commitAll") && !m.includes("pushPorcelain"));
  });

  test("residue-conflict: autostash pop leaves UU ⇒ refuse, stash preserved by SHA", async () => {
    const { git, wikiSync } = make({
      responses: {
        ...HEALTHY_PUSH,
        status: DIRTY,
        rebase: { exitCode: 0, stderr: "" }, // rebase succeeds; pop conflicts
        statusPorcelain: { stdout: "UU foreign.md\n", stderr: "", exitCode: 0 },
        revParse: "stash5ha",
      },
    });
    let caught;
    await assert.rejects(
      () => wikiSync.commitAndPush("wiki: claim x", ["MEMORY.md"]),
      (err) => {
        caught = err;
        return (
          err instanceof WikiPushFailure &&
          err.reason === PUSH_REASONS.RESIDUE_CONFLICT
        );
      },
    );
    assert.equal(caught.stashSha, "stash5ha");
    const m = git.calls.map((c) => c.method);
    assert.ok(!m.includes("pushPorcelain"), "no push on residue-conflict");
    assert.ok(!m.includes("stashDropBySha"), "stash is preserved, not dropped");
  });

  test("rejected after a successful fetch", async () => {
    const { wikiSync } = make({
      responses: {
        ...HEALTHY_PUSH,
        status: DIRTY,
        rebase: { exitCode: 0 },
        pushPorcelain: {
          stdout: "!\trefs/heads/master:refs/heads/master\t[rejected]\n",
          stderr: "",
          exitCode: 1,
        },
      },
    });
    await rejectsReason(
      () => wikiSync.commitAndPush("wiki: update"),
      PUSH_REASONS.REJECTED,
    );
  });

  test("transport when the fetch failed (rejection against a stale ref)", async () => {
    const { git, wikiSync } = make({
      responses: {
        ...HEALTHY_PUSH,
        status: DIRTY,
        rebase: { exitCode: 0 },
        pushPorcelain: {
          stdout: "!\trefs/heads/master:refs/heads/master\t[rejected]\n",
          stderr: "",
          exitCode: 1,
        },
      },
    });
    git.fetch = async () => {
      throw new Error("could not read Username");
    };
    await rejectsReason(
      () => wikiSync.commitAndPush("wiki: update"),
      PUSH_REASONS.TRANSPORT,
    );
  });

  test("transport on the push itself, exactly one push attempt", async () => {
    const { git, wikiSync } = make({
      responses: { ...HEALTHY_PUSH, status: DIRTY, rebase: { exitCode: 0 } },
    });
    git.pushPorcelain = async () => {
      throw new Error("network down");
    };
    await rejectsReason(
      () => wikiSync.commitAndPush("wiki: update"),
      PUSH_REASONS.TRANSPORT,
    );
  });

  test("occurrence-#41: success prose + zero exit but ref not updated ⇒ failure", async () => {
    // Inadmissible channels report success (prose, exit 0) while the per-ref
    // report says NOT updated and the remote tip does not advance.
    const { wikiSync } = make({
      responses: {
        ...HEALTHY_PUSH,
        status: DIRTY,
        rebase: { exitCode: 0 },
        pushPorcelain: {
          // exit 0 + reassuring prose, but the per-ref flag is `!` (rejected)
          stdout:
            "Everything up-to-date\n!\trefs/heads/master:refs/heads/master\t[remote rejected]\n",
          stderr: "",
          exitCode: 0,
        },
      },
    });
    await rejectsReason(
      () => wikiSync.commitAndPush("wiki: update"),
      PUSH_REASONS.REJECTED,
    );
  });

  test("ambiguous push report ⇒ grounded in a fresh remote-tip read", async () => {
    let tipCalls = 0;
    const { git, wikiSync } = make({
      responses: {
        ...HEALTHY_PUSH,
        status: DIRTY,
        rebase: { exitCode: 0 },
        pushPorcelain: { stdout: "garbage\n", stderr: "", exitCode: 0 },
      },
    });
    // First remoteRefTip = pre-push grounding (not contained); second = post-push
    // grounding after the ambiguous report. isAncestor true on the post-push read.
    git.isAncestor = async (_a, _b) => tipCalls++ > 0;
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.equal(result.landed, true);
    assert.equal(result.reason, PUSH_REASONS.LANDED);
  });

  // ── Conservation guard (D5) ──

  function conservationFixture(extra) {
    return make({
      responses: {
        ...HEALTHY_PUSH,
        status: DIRTY,
        rebase: { exitCode: 0 },
        ...extra,
      },
    });
  }

  test("conservation: clean-replay drop of a foreign file ⇒ refuse", async () => {
    const { git, wikiSync } = conservationFixture({
      diffNameStatus: "D\tweekly-log.md",
    });
    // Remote has content; HEAD dropped the whole file.
    git.showFile = async (ref) =>
      ref === REMOTE_TIP ? "foreign run record\n" : "";
    await rejectsReason(
      () => wikiSync.commitAndPush("wiki: update"),
      PUSH_REASONS.CONSERVATION,
    );
    assert.ok(!git.calls.map((c) => c.method).includes("pushPorcelain"));
  });

  test("conservation: row-level drop in a shared record ⇒ refuse", async () => {
    const { git, wikiSync } = conservationFixture({
      diffNameStatus: "M\tMEMORY.md",
    });
    git.showFile = async (ref) =>
      ref === REMOTE_TIP
        ? "| foreign-agent | spec-9 | b | - | d | e |\n| keep | row |\n"
        : "| keep | row |\n"; // the foreign row is gone
    await rejectsReason(
      () => wikiSync.commitAndPush("wiki: update"),
      PUSH_REASONS.CONSERVATION,
    );
  });

  test("conservation: declared release removal passes (commit-message act)", async () => {
    const { git, wikiSync } = conservationFixture({
      diffNameStatus: "M\tMEMORY.md",
    });
    // The release exemption is honored only when HEAD descends from the remote
    // tip (an authored release, not a stale-base drop). isAncestor("HEAD", tip)
    // is false (so not nothing-to-push); isAncestor(tip, "HEAD") is true.
    git.isAncestor = async (ancestor) => ancestor === REMOTE_TIP;
    git.showFile = async (ref) =>
      ref === REMOTE_TIP ? "| me | spec-9 | b | - | d | e |\n" : "";
    const result = await wikiSync.commitAndPush("wiki: release spec-9", [
      "MEMORY.md",
    ]);
    assert.equal(result.landed, true);
    assert.equal(result.reason, PUSH_REASONS.LANDED);
  });

  test("conservation: declared removal via the intent sidecar passes (and survives retry)", async () => {
    const { git, wikiSync } = make({
      responses: {
        ...HEALTHY_PUSH,
        status: DIRTY,
        rebase: { exitCode: 0 },
        diffNameStatus: "D\tother-agent-summary.md",
      },
      fsSync: createMockFs({
        [`${WIKI}/.git/fit-wiki-removal-intent`]: "other-agent-summary.md\n",
      }),
    });
    git.showFile = async (ref) =>
      ref === REMOTE_TIP ? "trimmed budget content\n" : "";
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.equal(result.landed, true);
    assert.equal(result.reason, PUSH_REASONS.LANDED);
  });

  test("conservation: pusher's own additive change passes (no foreign drop)", async () => {
    const { wikiSync } = conservationFixture({
      diffNameStatus: "M\tMEMORY.md",
    });
    // Remote content is fully present in HEAD (HEAD only added) ⇒ no drop.
    // showFile default ("" both sides) ⇒ #dropsForeignContent returns false.
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.equal(result.landed, true);
    assert.equal(result.reason, PUSH_REASONS.LANDED);
  });

  // ── Self-report (D8) ──

  test("self-report: a landed push emits a conservation pass line on stderr", async () => {
    const { wikiSync, stderr, runtime } = make({
      responses: { ...HEALTHY_PUSH, status: DIRTY, rebase: { exitCode: 0 } },
    });
    await wikiSync.commitAndPush("wiki: update");
    assert.match(stderr(), /wiki-conservation: pass/);
    // The self-report never lands on stdout (surfaces parse stdout).
    assert.equal(runtime.proc.stdout.chunks.join(""), "");
  });

  test("self-report: a refusal emits a conservation refusal line on stderr", async () => {
    const { git, wikiSync, stderr } = conservationFixture({
      diffNameStatus: "D\tweekly-log.md",
    });
    git.showFile = async (ref) => (ref === REMOTE_TIP ? "foreign\n" : "");
    await assert.rejects(() => wikiSync.commitAndPush("wiki: update"));
    assert.match(stderr(), /wiki-conservation: refusal/);
  });
});
