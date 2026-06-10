import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { GitClient } from "@forwardimpact/libutil/git-client";
import { runClaimCommand, runReleaseCommand } from "../src/commands/claim.js";
import { WikiSync } from "../src/wiki-sync.js";
import {
  git,
  createBareRepo,
  seedBareRepo,
  cloneRepo,
  makeRuntime,
  ctxFor,
} from "./helpers.js";

const EMPTY_CLAIMS =
  "## Active Claims\n\n| agent | target | branch | pr | claimed_at | expires_at |\n| --- | --- | --- | --- | --- | --- |\n| *None* | — | — | — | — | — |\n";

describe("claim/release push integration (real git)", () => {
  let bare;
  let parent;
  let wikiDir;
  let memPath;

  beforeEach(() => {
    bare = createBareRepo();
    seedBareRepo(bare);
    ({ parent, wikiDir } = cloneRepo(bare, "claim-push"));
    git(wikiDir, "checkout", "master");
    memPath = join(wikiDir, "MEMORY.md");
    writeFileSync(memPath, EMPTY_CLAIMS);
  });

  function harnessFor() {
    const harness = makeRuntime({ cwd: parent });
    const wikiSync = new WikiSync({
      runtime: harness.runtime,
      gitClient: new GitClient({ runtime: harness.runtime }),
      wikiDir,
      parentDir: parent,
      resolveToken: () => null,
    });
    return { harness, wikiSync };
  }

  test("claim pushes to remote", async () => {
    const { harness, wikiSync } = harnessFor();
    const result = await runClaimCommand(
      ctxFor({
        runtime: harness.runtime,
        wikiSync,
        options: {
          "wiki-root": wikiDir,
          agent: "staff-engineer",
          target: "spec-NNNN",
          branch: "feat/x",
          today: "2099-01-01",
        },
      }),
    );
    assert.equal(result.ok, true);
    assert.match(harness.stdout, /push: committed and pushed/);
    assert.match(
      git(bare, "log", "--oneline", "-1", "master"),
      /wiki: claim spec-NNNN/,
    );
  });

  test("claim leaves foreign dirty and untracked files out of the commit", async () => {
    // Residue another writer left in the shared workspace: a modified
    // tracked file and a brand-new untracked file (#1568).
    writeFileSync(join(wikiDir, "README.md"), "# Wiki\nforeign edit\n");
    writeFileSync(join(wikiDir, "foreign.md"), "untracked residue\n");
    const { harness, wikiSync } = harnessFor();
    const result = await runClaimCommand(
      ctxFor({
        runtime: harness.runtime,
        wikiSync,
        options: {
          "wiki-root": wikiDir,
          agent: "staff-engineer",
          target: "spec-NNNN",
          branch: "feat/x",
          today: "2099-01-01",
        },
      }),
    );
    assert.equal(result.ok, true);
    assert.match(harness.stdout, /push: committed and pushed/);
    assert.equal(
      git(bare, "diff-tree", "--no-commit-id", "--name-only", "-r", "master"),
      "MEMORY.md",
      "the pushed commit must touch MEMORY.md only",
    );
    // The git() helper trims output, so anchor on file names not columns.
    const status = git(wikiDir, "status", "--porcelain");
    assert.match(status, /M README\.md/, "foreign edit survives in the tree");
    assert.match(status, /\?\? foreign\.md/, "untracked residue survives");
  });

  test("release pushes to remote", async () => {
    writeFileSync(
      memPath,
      "## Active Claims\n\n| agent | target | branch | pr | claimed_at | expires_at |\n| --- | --- | --- | --- | --- | --- |\n| staff-engineer | spec-NNNN | feat/x | — | 2099-01-01 | 2099-01-08 |\n",
    );
    const { harness, wikiSync } = harnessFor();
    const result = await runReleaseCommand(
      ctxFor({
        runtime: harness.runtime,
        wikiSync,
        options: {
          "wiki-root": wikiDir,
          agent: "staff-engineer",
          target: "spec-NNNN",
        },
      }),
    );
    assert.equal(result.ok, true);
    assert.match(harness.stdout, /push: committed and pushed/);
    assert.match(
      git(bare, "log", "--oneline", "-1", "master"),
      /wiki: release spec-NNNN/,
    );
  });

  test("release leaves foreign dirty files out of the commit", async () => {
    writeFileSync(
      memPath,
      "## Active Claims\n\n| agent | target | branch | pr | claimed_at | expires_at |\n| --- | --- | --- | --- | --- | --- |\n| staff-engineer | spec-NNNN | feat/x | — | 2099-01-01 | 2099-01-08 |\n",
    );
    git(wikiDir, "add", "-A");
    git(wikiDir, "commit", "-m", "seed memory");
    git(wikiDir, "push", "origin", "master");
    writeFileSync(join(wikiDir, "README.md"), "# Wiki\nforeign edit\n");

    const { harness, wikiSync } = harnessFor();
    const result = await runReleaseCommand(
      ctxFor({
        runtime: harness.runtime,
        wikiSync,
        options: {
          "wiki-root": wikiDir,
          agent: "staff-engineer",
          target: "spec-NNNN",
        },
      }),
    );
    assert.equal(result.ok, true);
    assert.match(harness.stdout, /push: committed and pushed/);
    assert.equal(
      git(wikiDir, "show", "--name-only", "--format=", "HEAD"),
      "MEMORY.md",
    );
    assert.match(
      git(wikiDir, "status", "--porcelain"),
      /M README\.md/,
      "foreign edit survives in the tree",
    );
  });
});
