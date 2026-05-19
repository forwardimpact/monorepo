import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const CLI_PATH = new URL("../bin/fit-wiki.js", import.meta.url).pathname;

describe("fit-wiki boot CLI", () => {
  let dir;
  let wikiRoot;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "boot-cli-"));
    wikiRoot = join(dir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });
    writeFileSync(join(dir, "package.json"), '{"name":"root"}');
    writeFileSync(
      join(wikiRoot, "MEMORY.md"),
      "## Cross-Cutting Priorities\n\n| Item | Agents | Owner | Status | Added |\n| --- | --- | --- | --- | --- |\n| *None* | — | — | — | — |\n",
    );
    writeFileSync(
      join(wikiRoot, "staff-engineer.md"),
      "# Staff Engineer — Summary\n\nSE summary.\n",
    );
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("prints JSON digest", () => {
    const out = execFileSync(
      "node",
      [CLI_PATH, "boot", "--agent", "staff-engineer"],
      {
        cwd: dir,
        encoding: "utf-8",
      },
    );
    const digest = JSON.parse(out);
    assert.equal(typeof digest.summary, "string");
    assert.ok(Array.isArray(digest.owned_priorities));
    assert.ok(Array.isArray(digest.claims));
  });

  test("markdown format emits human-readable output", () => {
    const out = execFileSync(
      "node",
      [CLI_PATH, "boot", "--agent", "staff-engineer", "--format", "markdown"],
      {
        cwd: dir,
        encoding: "utf-8",
      },
    );
    assert.match(out, /# Boot Digest/);
  });
});
