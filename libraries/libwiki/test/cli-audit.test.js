import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const CLI_PATH = new URL("../bin/fit-wiki.js", import.meta.url).pathname;

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

describe("fit-wiki audit CLI", () => {
  let dir;
  let wikiRoot;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "audit-cli-"));
    wikiRoot = join(dir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });
    writeFileSync(join(dir, "package.json"), '{"name":"root"}');
    writeFileSync(
      join(wikiRoot, "MEMORY.md"),
      "## Cross-Cutting Priorities\n\n| Item | Agents | Owner | Status | Added |\n| --- | --- | --- | --- | --- |\n| *None* | — | — | — | — |\n",
    );
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("passes against a clean wiki", () => {
    const out = run(dir, ["audit"]);
    assert.match(out, /RESULT: pass/);
  });

  test("flags over-budget summary as fail", () => {
    const lines = Array(100).fill("x").join("\n");
    writeFileSync(
      join(wikiRoot, "staff-engineer.md"),
      `# Staff Engineer — Summary\n\n**Last run**: nothing.\n\n## Message Inbox\n\n<!-- memo:inbox -->\n\n${lines}\n`,
    );
    const r = runFail(dir, ["audit"]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /budget:.*staff-engineer.md has \d+ lines/);
  });

  test("grace window converts summary fail to warn", () => {
    const lines = Array(100).fill("x").join("\n");
    writeFileSync(
      join(wikiRoot, "staff-engineer.md"),
      `# Staff Engineer — Summary\n\n**Last run**: nothing.\n\n## Message Inbox\n\n<!-- memo:inbox -->\n\n${lines}\n`,
    );
    const out = run(dir, ["audit", "--today", "2026-05-19"], {
      FIT_WIKI_AUDIT_GRACE_UNTIL: "2026-06-18",
    });
    assert.match(out, /RESULT: pass/);
    assert.match(out, /WARN .*staff-engineer.md/);
  });

  test("weekly log over line budget fails", () => {
    const big = Array(550).fill("x").join("\n");
    writeFileSync(
      join(wikiRoot, "staff-engineer-2026-W25.md"),
      `# Staff Engineer — 2026-W25\n\n${big}\n`,
    );
    const r = runFail(dir, ["audit", "--today", "2026-06-22"]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /weekly-log:.*has \d+ lines/);
  });

  test("summary over word budget fails even when line count fits", () => {
    const paragraphs = Array(20)
      .fill(Array(900).fill("word").join(" "))
      .join("\n\n");
    writeFileSync(
      join(wikiRoot, "staff-engineer.md"),
      `# Staff Engineer — Summary\n\n**Last run**: nothing.\n\n## Message Inbox\n\n<!-- memo:inbox -->\n\n${paragraphs}\n`,
    );
    const r = runFail(dir, ["audit"]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /budget:.*staff-engineer.md has \d+ words/);
  });

  test("weekly log over word budget fails", () => {
    const paragraphs = Array(20)
      .fill(Array(500).fill("word").join(" "))
      .join("\n\n");
    writeFileSync(
      join(wikiRoot, "staff-engineer-2026-W25.md"),
      `# Staff Engineer — 2026-W25\n\n${paragraphs}\n`,
    );
    const r = runFail(dir, ["audit", "--today", "2026-06-22"]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /weekly-log:.*has \d+ words/);
  });

  test("JSON format emits machine-readable output", () => {
    const out = run(dir, ["audit", "--format", "json"]);
    const result = JSON.parse(out);
    assert.equal(result.result, "pass");
    assert.deepEqual(result.failures, []);
  });
});
