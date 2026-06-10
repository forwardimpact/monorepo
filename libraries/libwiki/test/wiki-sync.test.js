import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createTestRuntime,
  createMockGitClient,
  createMockFs,
} from "@forwardimpact/libmock";
import { WikiSync, WikiPullConflict } from "../src/wiki-sync.js";

const WIKI = "/repo/wiki";
const PARENT = "/repo";

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
  return { git, wikiSync, methods: () => git.calls.map((c) => c.method) };
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
    const { wikiSync, methods } = make({
      responses: {
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
      },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, { pushed: true, reason: "pushed" });
    assert.deepEqual(methods(), [
      "status",
      "commitAll",
      "revListCount",
      "fetch",
      "rebase",
      "push",
    ]);
  });

  test("commitAndPush with paths scopes the status check and commit", async () => {
    const { git, wikiSync, methods } = make({
      responses: {
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
      },
    });
    const result = await wikiSync.commitAndPush("wiki: claim x", ["MEMORY.md"]);
    assert.deepEqual(result, { pushed: true, reason: "pushed" });
    assert.deepEqual(methods(), [
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
    const { wikiSync, methods } = make({
      responses: {
        status: { stdout: "", stderr: "", exitCode: 0 },
        revListCount: 0,
      },
    });
    const result = await wikiSync.commitAndPush("wiki: claim x", ["MEMORY.md"]);
    assert.deepEqual(result, { pushed: false, reason: "clean" });
    assert.deepEqual(methods(), ["status", "revListCount"]);
  });

  test("commitAndPush is a no-op on a clean tree with nothing ahead", async () => {
    const { wikiSync, methods } = make({
      responses: {
        status: { stdout: "", stderr: "", exitCode: 0 },
        revListCount: 0,
      },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, { pushed: false, reason: "clean" });
    assert.deepEqual(methods(), ["status", "revListCount"]);
  });

  test("commitAndPush recovers via merge -X ours when the rebase fails", async () => {
    const { wikiSync, methods } = make({
      responses: {
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 1, stderr: "CONFLICT" },
        revListCount: 1,
      },
    });
    await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(methods(), [
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
