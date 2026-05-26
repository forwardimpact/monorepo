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
import { execFileSync } from "node:child_process";

const CLI_PATH = new URL("../bin/fit-wiki.js", import.meta.url).pathname;

describe("fit-wiki claim/release CLI", () => {
  let dir;
  let wikiRoot;
  let memoryPath;
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
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("claim inserts a row", () => {
    execFileSync(
      "node",
      [
        CLI_PATH,
        "claim",
        "--agent",
        "staff-engineer",
        "--target",
        "spec-NNNN",
        "--branch",
        "feat/x",
        "--today",
        "2026-05-19",
      ],
      { cwd: dir, encoding: "utf-8" },
    );
    const text = readFileSync(memoryPath, "utf-8");
    assert.match(text, /staff-engineer \| spec-NNNN \| feat\/x/);
  });

  test("claim refuses duplicates with exit 2", () => {
    execFileSync(
      "node",
      [
        CLI_PATH,
        "claim",
        "--agent",
        "staff-engineer",
        "--target",
        "spec-NNNN",
        "--branch",
        "feat/x",
      ],
      {
        cwd: dir,
        encoding: "utf-8",
      },
    );
    try {
      execFileSync(
        "node",
        [
          CLI_PATH,
          "claim",
          "--agent",
          "staff-engineer",
          "--target",
          "spec-NNNN",
          "--branch",
          "feat/y",
        ],
        {
          cwd: dir,
          encoding: "utf-8",
          stdio: "pipe",
        },
      );
      assert.fail("expected non-zero exit");
    } catch (err) {
      assert.equal(err.status, 2);
    }
  });

  test("release removes a row", () => {
    execFileSync(
      "node",
      [
        CLI_PATH,
        "claim",
        "--agent",
        "staff-engineer",
        "--target",
        "spec-NNNN",
        "--branch",
        "feat/x",
      ],
      {
        cwd: dir,
        encoding: "utf-8",
      },
    );
    execFileSync(
      "node",
      [
        CLI_PATH,
        "release",
        "--agent",
        "staff-engineer",
        "--target",
        "spec-NNNN",
      ],
      {
        cwd: dir,
        encoding: "utf-8",
      },
    );
    const text = readFileSync(memoryPath, "utf-8");
    assert.doesNotMatch(text, /staff-engineer \| spec-NNNN/);
  });

  test("release --expired clears expired rows", () => {
    writeFileSync(
      memoryPath,
      "## Active Claims\n\n| agent | target | branch | pr | claimed_at | expires_at |\n| --- | --- | --- | --- | --- | --- |\n| staff-engineer | old | feat/o | — | 2026-04-01 | 2026-04-08 |\n| staff-engineer | new | feat/n | — | 2026-05-19 | 2026-05-26 |\n",
    );
    execFileSync(
      "node",
      [CLI_PATH, "release", "--expired", "--today", "2026-05-19"],
      {
        cwd: dir,
        encoding: "utf-8",
      },
    );
    const text = readFileSync(memoryPath, "utf-8");
    assert.doesNotMatch(text, /\| old \|/);
    assert.match(text, /\| new \|/);
  });
});
