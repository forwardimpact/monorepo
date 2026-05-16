import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { WikiRepo, WikiPullConflict, buildAuthArgs } from "../src/wiki-repo.js";
import { git, createBareRepo, seedBareRepo, cloneRepo } from "./helpers.js";

describe("WikiRepo", () => {
  let bare;

  beforeEach(() => {
    bare = createBareRepo();
    seedBareRepo(bare);
  });

  test("isCloned returns false for empty dir", () => {
    const dir = mkdtempSync(join(tmpdir(), "wiki-empty-"));
    const repo = new WikiRepo({
      wikiDir: join(dir, "wiki"),
      parentDir: dir,
      resolveToken: () => null,
    });
    assert.equal(repo.isCloned(), false);
  });

  test("ensureCloned clones and isCloned returns true", () => {
    const parent = mkdtempSync(join(tmpdir(), "wiki-parent-"));
    const wikiDir = join(parent, "wiki");
    const repo = new WikiRepo({
      wikiDir,
      parentDir: parent,
      resolveToken: () => null,
    });

    const result = repo.ensureCloned(bare);
    assert.equal(result.cloned, true);
    assert.equal(repo.isCloned(), true);
  });

  test("ensureCloned is no-op when already cloned", () => {
    const { parent, wikiDir } = cloneRepo(bare, "noop");
    const repo = new WikiRepo({
      wikiDir,
      parentDir: parent,
      resolveToken: () => null,
    });

    const result = repo.ensureCloned(bare);
    assert.equal(result.cloned, true);
    assert.equal(result.reason, "already-cloned");
  });

  test("ensureCloned returns cloned:false for bad URL", () => {
    const parent = mkdtempSync(join(tmpdir(), "wiki-bad-"));
    const wikiDir = join(parent, "wiki");
    const repo = new WikiRepo({
      wikiDir,
      parentDir: parent,
      resolveToken: () => null,
    });

    const result = repo.ensureCloned("/nonexistent/path.git");
    assert.equal(result.cloned, false);
  });

  test("isClean detects dirty tree", () => {
    const { parent, wikiDir } = cloneRepo(bare, "dirty");
    git(wikiDir, "checkout", "master");
    const repo = new WikiRepo({
      wikiDir,
      parentDir: parent,
      resolveToken: () => null,
    });

    assert.equal(repo.isClean(), true);
    writeFileSync(join(wikiDir, "new.md"), "content");
    assert.equal(repo.isClean(), false);
  });

  test("inheritIdentity propagates parent config", () => {
    const { parent, wikiDir } = cloneRepo(bare, "identity");
    git(parent, "init");
    git(parent, "config", "user.name", "Parent Name");
    git(parent, "config", "user.email", "parent@example.com");

    const repo = new WikiRepo({
      wikiDir,
      parentDir: parent,
      resolveToken: () => null,
    });
    repo.inheritIdentity();

    assert.equal(git(wikiDir, "config", "--get", "user.name"), "Parent Name");
    assert.equal(
      git(wikiDir, "config", "--get", "user.email"),
      "parent@example.com",
    );
  });

  test("pull picks up remote changes", () => {
    const { wikiDir: w1 } = cloneRepo(bare, "pull1");
    const { parent: p2, wikiDir: w2 } = cloneRepo(bare, "pull2");
    git(w1, "checkout", "master");
    git(w2, "checkout", "master");

    writeFileSync(join(w1, "change.md"), "from clone1");
    git(w1, "add", "-A");
    git(w1, "commit", "-m", "clone1 change");
    git(w1, "push", "origin", "master");

    const repo2 = new WikiRepo({
      wikiDir: w2,
      parentDir: p2,
      resolveToken: () => null,
    });
    repo2.pull();

    const content = execFileSync("cat", [join(w2, "change.md")], {
      encoding: "utf-8",
    });
    assert.equal(content.trim(), "from clone1");
  });

  test("pull throws WikiPullConflict on divergence", () => {
    const { wikiDir: w1 } = cloneRepo(bare, "conflict1");
    const { parent: p2, wikiDir: w2 } = cloneRepo(bare, "conflict2");
    git(w1, "checkout", "master");
    git(w2, "checkout", "master");

    writeFileSync(join(w1, "README.md"), "clone1 edit");
    git(w1, "add", "-A");
    git(w1, "commit", "-m", "clone1");
    git(w1, "push", "origin", "master");

    writeFileSync(join(w2, "README.md"), "clone2 edit");
    git(w2, "add", "-A");
    git(w2, "commit", "-m", "clone2");

    const repo2 = new WikiRepo({
      wikiDir: w2,
      parentDir: p2,
      resolveToken: () => null,
    });
    assert.throws(() => repo2.pull(), WikiPullConflict);
  });

  test("commitAndPush is no-op on clean tree", () => {
    const { parent, wikiDir } = cloneRepo(bare, "clean");
    git(wikiDir, "checkout", "master");
    const repo = new WikiRepo({
      wikiDir,
      parentDir: parent,
      resolveToken: () => null,
    });

    const result = repo.commitAndPush("test");
    assert.equal(result.pushed, false);
    assert.equal(result.reason, "clean");
  });

  test("commitAndPush commits and pushes dirty tree", () => {
    const { parent, wikiDir } = cloneRepo(bare, "push");
    git(wikiDir, "checkout", "master");
    const repo = new WikiRepo({
      wikiDir,
      parentDir: parent,
      resolveToken: () => null,
    });

    writeFileSync(join(wikiDir, "update.md"), "new content");
    const result = repo.commitAndPush("wiki: test push");
    assert.equal(result.pushed, true);

    const log = git(wikiDir, "log", "-1", "--oneline");
    assert.ok(log.includes("wiki: test push"));

    const diff = git(wikiDir, "diff", "origin/master");
    assert.equal(diff, "");
  });

  test("commitAndPush pushes pre-existing local commits on clean tree", () => {
    const { parent, wikiDir } = cloneRepo(bare, "ahead");
    git(wikiDir, "checkout", "master");

    writeFileSync(join(wikiDir, "inline.md"), "committed inline by caller");
    git(wikiDir, "add", "-A");
    git(wikiDir, "commit", "-m", "inline commit by caller");

    const headBefore = git(wikiDir, "rev-parse", "HEAD");

    const repo = new WikiRepo({
      wikiDir,
      parentDir: parent,
      resolveToken: () => null,
    });
    const result = repo.commitAndPush("wiki: should not be used");
    assert.equal(result.pushed, true);
    assert.equal(result.reason, "pushed");

    const headAfter = git(wikiDir, "rev-parse", "HEAD");
    assert.equal(
      headAfter,
      headBefore,
      "no new commit object should be created when the tree is clean",
    );

    const diff = git(wikiDir, "diff", "origin/master");
    assert.equal(
      diff,
      "",
      "local HEAD and origin/master should match after push",
    );

    const log = git(wikiDir, "log", "-1", "--format=%s");
    assert.equal(
      log,
      "inline commit by caller",
      "the existing commit should be the tip, not a new one",
    );
  });

  test("commitAndPush recovers via merge -X ours on divergence", () => {
    const { wikiDir: w1 } = cloneRepo(bare, "merge1");
    const { parent: p2, wikiDir: w2 } = cloneRepo(bare, "merge2");
    git(w1, "checkout", "master");
    git(w2, "checkout", "master");

    writeFileSync(join(w1, "README.md"), "remote change");
    git(w1, "add", "-A");
    git(w1, "commit", "-m", "remote");
    git(w1, "push", "origin", "master");

    writeFileSync(join(w2, "README.md"), "local wins");
    const repo2 = new WikiRepo({
      wikiDir: w2,
      parentDir: p2,
      resolveToken: () => null,
    });
    const result = repo2.commitAndPush("wiki: local update");
    assert.equal(result.pushed, true);

    const content = execFileSync("cat", [join(w2, "README.md")], {
      encoding: "utf-8",
    });
    assert.equal(content.trim(), "local wins");
  });
});

describe("buildAuthArgs", () => {
  test("prepends credential helper flags when token is set", () => {
    const args = ["-C", "/wiki", "fetch", "origin", "master"];
    const result = buildAuthArgs(args, "ghp_test123");

    assert.equal(result[0], "-c");
    assert.equal(result[1], "credential.helper=");
    assert.equal(result[2], "-c");
    assert.ok(result[3].startsWith("credential.helper=!f()"));
    assert.ok(result[3].includes("x-access-token"));
    assert.ok(result[3].includes("GH_TOKEN"));
    assert.deepEqual(result.slice(4), args);
  });

  test("passes args through without flags when no token", () => {
    const args = ["clone", "https://example.com/repo.git", "/wiki"];
    const result = buildAuthArgs(args, undefined);

    assert.deepEqual(result, args);
  });
});

describe("WikiRepo resolveToken", () => {
  let bare;

  beforeEach(() => {
    bare = createBareRepo();
    seedBareRepo(bare);
  });

  test("invokes resolveToken on network operations", () => {
    const { parent, wikiDir } = cloneRepo(bare, "tokencb");
    git(wikiDir, "checkout", "master");
    let calls = 0;
    const repo = new WikiRepo({
      wikiDir,
      parentDir: parent,
      resolveToken: () => {
        calls++;
        return "ghp_fromcallback";
      },
    });

    repo.fetch();
    assert.ok(calls >= 1, "resolveToken should be called by fetch()");
  });

  test("does not invoke resolveToken on local-only operations", () => {
    const { parent, wikiDir } = cloneRepo(bare, "tokenlocal");
    git(wikiDir, "checkout", "master");
    let calls = 0;
    const repo = new WikiRepo({
      wikiDir,
      parentDir: parent,
      resolveToken: () => {
        calls++;
        return "ghp_unused";
      },
    });

    repo.isCloned();
    repo.isClean();
    repo.inheritIdentity();

    assert.equal(calls, 0);
  });

  test("propagates errors thrown by resolveToken", () => {
    const { parent, wikiDir } = cloneRepo(bare, "tokenthrow");
    git(wikiDir, "checkout", "master");
    const repo = new WikiRepo({
      wikiDir,
      parentDir: parent,
      resolveToken: () => {
        throw new Error("not configured");
      },
    });

    assert.throws(() => repo.fetch(), /not configured/);
  });

  test("constructor rejects missing resolveToken", () => {
    assert.throws(
      () => new WikiRepo({ wikiDir: "/tmp/x", parentDir: "/tmp/y" }),
      TypeError,
    );
  });

  test("constructor rejects non-string wikiDir", () => {
    assert.throws(
      () =>
        new WikiRepo({
          wikiDir: undefined,
          parentDir: "/tmp/y",
          resolveToken: () => null,
        }),
      /wikiDir must be a non-empty string/,
    );
  });

  test("constructor rejects non-string parentDir", () => {
    assert.throws(
      () =>
        new WikiRepo({
          wikiDir: "/tmp/x",
          parentDir: undefined,
          resolveToken: () => null,
        }),
      /parentDir must be a non-empty string/,
    );
  });
});
