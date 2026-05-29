import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runClaimCommand, runReleaseCommand } from "../src/commands/claim.js";
import { createTestIo, runWithIo } from "../src/io.js";
import { WikiRepo } from "../src/wiki-repo.js";
import { git, createBareRepo, seedBareRepo, cloneRepo } from "./helpers.js";

function makeCli() {
  return {
    errors: [],
    usageError(message) {
      this.errors.push(message);
    },
  };
}

describe("fit-wiki claim/release CLI", () => {
  let dir;
  let wikiRoot;
  let memoryPath;
  let cli;
  let io;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "claim-cli-"));
    wikiRoot = join(dir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });
    writeFileSync(join(dir, "package.json"), '{"name":"root"}');
    memoryPath = join(wikiRoot, "MEMORY.md");
    writeFileSync(
      memoryPath,
      "## Active Claims\n\n| agent | target | branch | pr | claimed_at | expires_at |\n| --- | --- | --- | --- | --- | --- |\n| *None* | — | — | — | — | — |\n",
    );
    cli = makeCli();
    io = createTestIo({ cwd: () => dir });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("claim inserts a row", async () => {
    await runWithIo(() =>
      runClaimCommand(
        {
          agent: "staff-engineer",
          target: "spec-NNNN",
          branch: "feat/x",
          today: "2026-05-19",
        },
        [],
        cli,
        io,
        null,
      ),
    );
    const text = readFileSync(memoryPath, "utf-8");
    assert.match(text, /staff-engineer \| spec-NNNN \| feat\/x/);
    assert.equal(io.exitCode, null);
  });

  test("claim refuses duplicates with exit 2", async () => {
    await runWithIo(() =>
      runClaimCommand(
        { agent: "staff-engineer", target: "spec-NNNN", branch: "feat/x" },
        [],
        cli,
        io,
        null,
      ),
    );
    await runWithIo(() =>
      runClaimCommand(
        { agent: "staff-engineer", target: "spec-NNNN", branch: "feat/y" },
        [],
        cli,
        io,
        null,
      ),
    );
    assert.equal(io.exitCode, 2);
  });

  test("release removes a row", async () => {
    await runWithIo(() =>
      runClaimCommand(
        { agent: "staff-engineer", target: "spec-NNNN", branch: "feat/x" },
        [],
        cli,
        io,
        null,
      ),
    );
    await runWithIo(() =>
      runReleaseCommand(
        { agent: "staff-engineer", target: "spec-NNNN" },
        [],
        cli,
        io,
        null,
      ),
    );
    const text = readFileSync(memoryPath, "utf-8");
    assert.doesNotMatch(text, /staff-engineer \| spec-NNNN/);
  });

  test("release --expired clears expired rows", async () => {
    writeFileSync(
      memoryPath,
      "## Active Claims\n\n| agent | target | branch | pr | claimed_at | expires_at |\n| --- | --- | --- | --- | --- | --- |\n| staff-engineer | old | feat/o | — | 2026-04-01 | 2026-04-08 |\n| staff-engineer | new | feat/n | — | 2026-05-19 | 2026-05-26 |\n",
    );
    await runWithIo(() =>
      runReleaseCommand(
        { expired: true, today: "2026-05-19" },
        [],
        cli,
        io,
        null,
      ),
    );
    const text = readFileSync(memoryPath, "utf-8");
    assert.doesNotMatch(text, /\| old \|/);
    assert.match(text, /\| new \|/);
  });
});

describe("claim/release push integration", () => {
  let bare;
  let parent;
  let wikiDir;
  let memPath;
  let cli;
  let io;

  beforeEach(() => {
    bare = createBareRepo();
    seedBareRepo(bare);
    ({ parent, wikiDir } = cloneRepo(bare, "claim-push"));
    git(wikiDir, "checkout", "master");
    memPath = join(wikiDir, "MEMORY.md");
    writeFileSync(
      memPath,
      "## Active Claims\n\n| agent | target | branch | pr | claimed_at | expires_at |\n| --- | --- | --- | --- | --- | --- |\n| *None* | — | — | — | — | — |\n",
    );
    writeFileSync(join(parent, "package.json"), '{"name":"root"}');
    cli = makeCli();
    io = createTestIo({ cwd: () => parent });
  });

  function repoFactory(_values, _cwd) {
    return new WikiRepo({
      wikiDir,
      parentDir: parent,
      resolveToken: () => null,
    });
  }

  test("claim pushes to remote", async () => {
    await runWithIo(() =>
      runClaimCommand(
        {
          agent: "staff-engineer",
          target: "spec-NNNN",
          branch: "feat/x",
          today: "2099-01-01",
        },
        [],
        cli,
        io,
        repoFactory,
      ),
    );

    assert.match(io.out, /push: committed and pushed/);
    const log = git(bare, "log", "--oneline", "-1", "master");
    assert.match(log, /wiki: claim spec-NNNN/);
  });

  test("claim succeeds locally when push fails", async () => {
    const failingFactory = async () => {
      throw new Error("network down");
    };
    await runWithIo(() =>
      runClaimCommand(
        {
          agent: "staff-engineer",
          target: "spec-NNNN",
          branch: "feat/x",
          today: "2099-01-01",
        },
        [],
        cli,
        io,
        failingFactory,
      ),
    );

    assert.equal(io.exitCode, null);
    const text = readFileSync(memPath, "utf-8");
    assert.match(text, /staff-engineer \| spec-NNNN/);
    assert.match(io.err, /push failed.*network down/);
  });

  test("release pushes to remote", async () => {
    writeFileSync(
      memPath,
      "## Active Claims\n\n| agent | target | branch | pr | claimed_at | expires_at |\n| --- | --- | --- | --- | --- | --- |\n| staff-engineer | spec-NNNN | feat/x | — | 2099-01-01 | 2099-01-08 |\n",
    );
    await runWithIo(() =>
      runReleaseCommand(
        { agent: "staff-engineer", target: "spec-NNNN" },
        [],
        cli,
        io,
        repoFactory,
      ),
    );

    assert.match(io.out, /push: committed and pushed/);
    const log = git(bare, "log", "--oneline", "-1", "master");
    assert.match(log, /wiki: release spec-NNNN/);
  });
});
