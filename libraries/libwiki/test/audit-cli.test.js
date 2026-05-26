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

function runFail(dir, args, env = {}) {
  try {
    execFileSync("node", [CLI_PATH, ...args], {
      cwd: dir,
      encoding: "utf-8",
      stdio: "pipe",
      env: { ...process.env, ...env },
    });
    assert.fail("expected non-zero exit");
  } catch (err) {
    return { status: err.status, stdout: err.stdout, stderr: err.stderr };
  }
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

describe("fit-wiki audit CLI", () => {
  let dir;
  let wikiRoot;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "audit-cli-"));
    wikiRoot = join(dir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });
    writeFileSync(join(dir, "package.json"), '{"name":"root"}');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("clean wiki: JSON shape and exit 0", () => {
    seedCleanWiki(wikiRoot);
    const out = run(dir, [
      "audit",
      "--today",
      "2026-05-24",
      "--format",
      "json",
    ]);
    const result = JSON.parse(out);
    assert.equal(result.result, "pass");
    assert.deepEqual(result.failures, []);
    assert.deepEqual(result.warnings, []);
  });

  test("over-budget summary: JSON failure with id, path, exit 1", () => {
    seedCleanWiki(wikiRoot);
    const big = Array(600).fill("x").join("\n");
    writeFileSync(
      join(wikiRoot, "staff-engineer.md"),
      `# Staff Engineer — Summary\n\n**Last run**: nothing.\n\n## Message Inbox\n\n<!-- memo:inbox -->\n\n${big}\n`,
    );
    const r = runFail(dir, [
      "audit",
      "--today",
      "2026-05-24",
      "--format",
      "json",
    ]);
    assert.equal(r.status, 1);
    const result = JSON.parse(r.stdout);
    assert.equal(result.result, "fail");
    const lineBudget = result.failures.find(
      (f) => f.id === "summary.line-budget",
    );
    assert.ok(lineBudget, "expected a summary.line-budget failure");
    assert.match(lineBudget.path, /staff-engineer\.md$/);
    assert.equal(lineBudget.level, "fail");
    assert.match(lineBudget.message, /^\d+ lines \(limit 496\)$/);
  });

  test("text emitter: WARN before FAIL, RESULT trailer", () => {
    seedCleanWiki(wikiRoot);
    const big = Array(600).fill("x").join("\n");
    writeFileSync(
      join(wikiRoot, "staff-engineer.md"),
      `# Staff Engineer — Summary\n\n**Last run**: nothing.\n\n## Message Inbox\n\n<!-- memo:inbox -->\n\n${big}\n`,
    );
    const r = runFail(dir, ["audit", "--today", "2026-05-24"]);
    assert.equal(r.status, 1);
    // ESLint-style: relative path header, then indented `error` lines
    assert.match(r.stdout, /^wiki\/staff-engineer\.md$/m);
    assert.match(r.stdout, /^ +\d* +error +.+ +summary\.line-budget$/m);
    assert.match(r.stdout, /^✖ \d+ problems? \(\d+ errors?, \d+ warnings?\)$/m);
  });
});
