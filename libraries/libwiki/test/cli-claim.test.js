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
      ),
    );
    await runWithIo(() =>
      runClaimCommand(
        { agent: "staff-engineer", target: "spec-NNNN", branch: "feat/y" },
        [],
        cli,
        io,
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
      ),
    );
    await runWithIo(() =>
      runReleaseCommand(
        { agent: "staff-engineer", target: "spec-NNNN" },
        [],
        cli,
        io,
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
      runReleaseCommand({ expired: true, today: "2026-05-19" }, [], cli, io),
    );
    const text = readFileSync(memoryPath, "utf-8");
    assert.doesNotMatch(text, /\| old \|/);
    assert.match(text, /\| new \|/);
  });
});
