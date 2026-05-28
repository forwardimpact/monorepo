import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const CLI_PATH = new URL("../bin/fit-wiki.js", import.meta.url).pathname;
const STORYBOARD_AGENTS = [
  "product-manager",
  "release-engineer",
  "security-engineer",
  "staff-engineer",
  "technical-writer",
];

function run(dir, args, env = {}) {
  return execFileSync("node", [CLI_PATH, ...args], {
    cwd: dir,
    encoding: "utf-8",
    env: { ...process.env, ...env },
  });
}

function seedCleanWiki(wikiRoot, today = "2026-05-24") {
  writeFileSync(
    join(wikiRoot, "MEMORY.md"),
    [
      "## Cross-Cutting Priorities",
      "",
      "| Item | Agents | Owner | Status | Added |",
      "| --- | --- | --- | --- | --- |",
      "| *None* | — | — | — | — |",
      "",
    ].join("\n"),
  );
  const d = new Date(today);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  writeFileSync(
    join(wikiRoot, `storyboard-${yyyy}-M${mm}.md`),
    [
      `# Storyboard — ${yyyy}-${mm}`,
      "",
      ...STORYBOARD_AGENTS.map((a) => `### ${a} — backlog\n- item`),
      "",
    ].join("\n"),
  );
}

describe("fit-wiki fix CLI", () => {
  let dir;
  let wikiRoot;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fix-cli-"));
    wikiRoot = join(dir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });
    writeFileSync(join(dir, "package.json"), '{"name":"root"}');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("clean wiki: prints 'nothing to fix' and exits 0", () => {
    seedCleanWiki(wikiRoot);
    const out = run(dir, ["fix", "--today", "2026-05-24"]);
    assert.match(out, /nothing to fix/);
  });
});
