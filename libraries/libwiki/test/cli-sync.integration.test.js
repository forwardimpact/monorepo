import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GitClient } from "@forwardimpact/libutil/git-client";
import { runPushCommand, runPullCommand } from "../src/commands/sync.js";
import { WikiSync } from "../src/wiki-sync.js";
import {
  git,
  createBareRepo,
  seedBareRepo,
  cloneRepo,
  makeRuntime,
  ctxFor,
} from "./helpers.js";

describe("push/pull commands (real git)", () => {
  let bare;

  beforeEach(() => {
    bare = createBareRepo();
    seedBareRepo(bare);
  });

  function harnessFor(wikiDir, parent) {
    const harness = makeRuntime({ cwd: parent });
    const wikiSync = new WikiSync({
      runtime: harness.runtime,
      gitClient: new GitClient({ runtime: harness.runtime }),
      wikiDir,
      parentDir: parent,
      resolveToken: () => null,
    });
    return { harness, ctx: ctxFor({ runtime: harness.runtime, wikiSync }) };
  }

  test("push with no local changes writes 'nothing to push'", async () => {
    const { parent, wikiDir } = cloneRepo(bare, "push-noop");
    git(wikiDir, "checkout", "master");
    const { harness, ctx } = harnessFor(wikiDir, parent);
    const result = await runPushCommand(ctx);
    assert.equal(result.ok, true);
    assert.match(harness.stdout, /push: nothing to push/);
  });

  test("push with local change commits and pushes", async () => {
    const { parent, wikiDir } = cloneRepo(bare, "push-dirty");
    git(wikiDir, "checkout", "master");
    writeFileSync(join(wikiDir, "new.md"), "content");
    const { harness, ctx } = harnessFor(wikiDir, parent);
    const result = await runPushCommand(ctx);
    assert.equal(result.ok, true);
    assert.match(harness.stdout, /push: committed and pushed/);
    assert.ok(
      git(wikiDir, "log", "-1", "--oneline").includes(
        "wiki: update from session",
      ),
    );
    assert.equal(git(wikiDir, "diff", "origin/master"), "");
  });

  test("pull picks up an external commit", async () => {
    const { wikiDir: w1 } = cloneRepo(bare, "pull-ext1");
    const { parent: p2, wikiDir: w2 } = cloneRepo(bare, "pull-ext2");
    git(w1, "checkout", "master");
    git(w2, "checkout", "master");
    writeFileSync(join(w1, "external.md"), "from another clone");
    git(w1, "add", "-A");
    git(w1, "commit", "-m", "external push");
    git(w1, "push", "origin", "master");

    const { harness, ctx } = harnessFor(w2, p2);
    const result = await runPullCommand(ctx);
    assert.equal(result.ok, true);
    assert.match(harness.stdout, /pull: up to date/);
    assert.equal(
      readFileSync(join(w2, "external.md"), "utf-8").trim(),
      "from another clone",
    );
  });

  test("pull with diverging local edit returns a conflict envelope", async () => {
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

    const { harness, ctx } = harnessFor(w2, p2);
    const result = await runPullCommand(ctx);
    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(harness.stderr, /rebase conflict/);
  });

  test("push refuses on a detached HEAD with pending writes (no silent loss)", async () => {
    const { parent, wikiDir } = cloneRepo(bare, "push-detached");
    git(wikiDir, "checkout", "master");
    const head = git(wikiDir, "rev-parse", "HEAD");
    git(wikiDir, "checkout", head); // detach
    writeFileSync(join(wikiDir, "pending.md"), "session work");
    const { harness, ctx } = harnessFor(wikiDir, parent);
    const result = await runPushCommand(ctx);
    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(harness.stderr, /detached/);
    // No commit was created and HEAD did not move; the pending work survives as
    // an uncommitted change rather than being swept into a lost detached commit.
    assert.equal(git(wikiDir, "rev-parse", "HEAD"), head);
    assert.match(
      git(wikiDir, "status", "--porcelain", "--", "pending.md"),
      /pending\.md/,
    );
  });

  test("push refuses on severed (unrelated) local history", async () => {
    const { parent, wikiDir } = cloneRepo(bare, "push-severed");
    git(wikiDir, "checkout", "master");
    // Replace master with an unrelated root sharing no merge-base.
    git(wikiDir, "checkout", "--orphan", "severed");
    writeFileSync(join(wikiDir, "alien.md"), "unrelated");
    git(wikiDir, "add", "-A");
    git(wikiDir, "commit", "-m", "alien root");
    git(wikiDir, "branch", "-M", "master");
    const tip = git(wikiDir, "rev-parse", "HEAD");
    const { harness, ctx } = harnessFor(wikiDir, parent);
    const result = await runPushCommand(ctx);
    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(harness.stderr, /unrelated/);
    assert.equal(git(wikiDir, "rev-parse", "HEAD"), tip); // no new commit
  });
});
