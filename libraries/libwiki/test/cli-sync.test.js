import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { WikiRepo, WikiPullConflict } from "../src/wiki-repo.js";
import { git, createBareRepo, seedBareRepo, cloneRepo } from "./helpers.js";

describe("push/pull commands", () => {
  let bare;

  beforeEach(() => {
    bare = createBareRepo();
    seedBareRepo(bare);
  });

  test("push with no local changes is no-op", () => {
    const { parent, wikiDir } = cloneRepo(bare, "push-noop");
    git(wikiDir, "checkout", "master");
    const repo = new WikiRepo({
      wikiDir,
      parentDir: parent,
      resolveToken: () => null,
    });

    const result = repo.commitAndPush("wiki: update");
    assert.equal(result.pushed, false);
    assert.equal(result.reason, "clean");
  });

  test("push with local change commits and pushes", () => {
    const { parent, wikiDir } = cloneRepo(bare, "push-dirty");
    git(wikiDir, "checkout", "master");
    const repo = new WikiRepo({
      wikiDir,
      parentDir: parent,
      resolveToken: () => null,
    });

    writeFileSync(join(wikiDir, "new.md"), "content");
    const result = repo.commitAndPush("wiki: update from session");
    assert.equal(result.pushed, true);

    const log = git(wikiDir, "log", "-1", "--oneline");
    assert.ok(log.includes("wiki: update from session"));

    const diff = git(wikiDir, "diff", "origin/master");
    assert.equal(diff, "");
  });

  test("pull picks up external commit", () => {
    const { wikiDir: w1 } = cloneRepo(bare, "pull-ext1");
    const { parent: p2, wikiDir: w2 } = cloneRepo(bare, "pull-ext2");
    git(w1, "checkout", "master");
    git(w2, "checkout", "master");

    writeFileSync(join(w1, "external.md"), "from another clone");
    git(w1, "add", "-A");
    git(w1, "commit", "-m", "external push");
    git(w1, "push", "origin", "master");

    const repo2 = new WikiRepo({
      wikiDir: w2,
      parentDir: p2,
      resolveToken: () => null,
    });
    repo2.pull();

    const content = readFileSync(join(w2, "external.md"), "utf-8");
    assert.equal(content.trim(), "from another clone");
  });

  test("pull with diverging local edit throws WikiPullConflict", () => {
    const { wikiDir: w1 } = cloneRepo(bare, "pull-div1");
    const { parent: p2, wikiDir: w2 } = cloneRepo(bare, "pull-div2");
    git(w1, "checkout", "master");
    git(w2, "checkout", "master");

    writeFileSync(join(w1, "README.md"), "remote edit");
    git(w1, "add", "-A");
    git(w1, "commit", "-m", "remote");
    git(w1, "push", "origin", "master");

    writeFileSync(join(w2, "README.md"), "local edit");
    git(w2, "add", "-A");
    git(w2, "commit", "-m", "local");

    const repo2 = new WikiRepo({
      wikiDir: w2,
      parentDir: p2,
      resolveToken: () => null,
    });
    assert.throws(() => repo2.pull(), WikiPullConflict);
  });
});
