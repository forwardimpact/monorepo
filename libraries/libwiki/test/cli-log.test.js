import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const CLI_PATH = new URL("../bin/fit-wiki.js", import.meta.url).pathname;

describe("fit-wiki log CLI", () => {
  let dir;
  let wikiRoot;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "log-cli-"));
    wikiRoot = join(dir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });
    writeFileSync(join(dir, "package.json"), '{"name":"root"}');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("log decision writes leading ### Decision block", () => {
    execFileSync(
      "node",
      [
        CLI_PATH,
        "log",
        "decision",
        "--agent",
        "staff-engineer",
        "--surveyed",
        "owned",
        "--chosen",
        "implement spec 1060",
        "--rationale",
        "merged plan",
        "--today",
        "2026-05-19",
      ],
      { cwd: dir, encoding: "utf-8" },
    );
    const expected = join(wikiRoot, "staff-engineer-2026-W21.md");
    assert.equal(existsSync(expected), true);
    const text = readFileSync(expected, "utf-8");
    assert.match(text, /## 2026-05-19/);
    assert.match(text, /### Decision/);
    assert.match(text, /\*\*Surveyed:\*\* owned/);
    assert.match(text, /\*\*Chosen:\*\* implement spec 1060/);
  });

  test("missing subcommand exits 2", () => {
    try {
      execFileSync("node", [CLI_PATH, "log", "--agent", "staff-engineer"], {
        cwd: dir,
        encoding: "utf-8",
        stdio: "pipe",
      });
      assert.fail("expected exit 2");
    } catch (err) {
      assert.equal(err.status, 2);
    }
  });
});
