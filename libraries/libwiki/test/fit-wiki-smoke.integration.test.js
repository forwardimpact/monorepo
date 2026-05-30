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

// The one allow-listed smoke test per binary (SC5): it spawns the real bin to
// prove the runtime/dispatch wiring end-to-end. Every other libwiki command is
// covered in-process against injected collaborators.
const CLI_PATH = new URL("../bin/fit-wiki.js", import.meta.url).pathname;

describe("fit-wiki bin smoke", () => {
  let dir;
  let wikiRoot;
  let memoryPath;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fit-wiki-smoke-"));
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

  test("claim writes a row and exits 0", () => {
    const out = execFileSync(
      "node",
      [
        CLI_PATH,
        "claim",
        "--target",
        "test-smoke",
        "--branch",
        "test",
        "--agent",
        "staff-engineer",
        "--today",
        "2099-01-01",
      ],
      { cwd: dir, encoding: "utf-8" },
    );
    assert.match(out, /claimed test-smoke/);
    assert.match(
      readFileSync(memoryPath, "utf-8"),
      /staff-engineer \| test-smoke \| test/,
    );
  });
});
