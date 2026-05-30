import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runAuditCommand } from "../src/commands/audit.js";
import { makeRuntime, ctxFor } from "./helpers.js";

const STORYBOARD_AGENTS = [
  "product-manager",
  "release-engineer",
  "security-engineer",
  "staff-engineer",
  "technical-writer",
];

function seedCleanWiki(wikiRoot) {
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
  writeFileSync(
    join(wikiRoot, "storyboard-2026-M05.md"),
    [
      "# Storyboard — 2026-05",
      "",
      ...STORYBOARD_AGENTS.map((a) => `### ${a} — backlog\n- item`),
      "",
    ].join("\n"),
  );
}

describe("fit-wiki audit CLI (in-process)", () => {
  let dir;
  let wikiRoot;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "audit-cli-"));
    wikiRoot = join(dir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });
    writeFileSync(join(dir, "package.json"), '{"name":"root"}');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function run(options) {
    const harness = makeRuntime({ cwd: dir });
    const result = runAuditCommand(
      ctxFor({
        runtime: harness.runtime,
        options: { today: "2026-05-24", ...options },
      }),
    );
    return { harness, result };
  }

  test("clean wiki: JSON shape and exit 0", () => {
    seedCleanWiki(wikiRoot);
    const { harness, result } = run({ format: "json" });
    assert.equal(result.ok, true);
    const parsed = JSON.parse(harness.stdout);
    assert.equal(parsed.result, "pass");
    assert.deepEqual(parsed.failures, []);
    assert.deepEqual(parsed.warnings, []);
  });

  test("over-budget summary: JSON failure with id, path, exit 1", () => {
    seedCleanWiki(wikiRoot);
    const big = Array(600).fill("x").join("\n");
    writeFileSync(
      join(wikiRoot, "staff-engineer.md"),
      `# Staff Engineer — Summary\n\n**Last run**: nothing.\n\n## Message Inbox\n\n<!-- memo:inbox -->\n\n${big}\n`,
    );
    const { harness, result } = run({ format: "json" });
    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    const parsed = JSON.parse(harness.stdout);
    assert.equal(parsed.result, "fail");
    const lineBudget = parsed.failures.find(
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
    const { harness, result } = run({});
    assert.equal(result.code, 1);
    assert.match(harness.stdout, /^wiki\/staff-engineer\.md$/m);
    assert.match(harness.stdout, /^ +\d* +error +.+ +summary\.line-budget$/m);
    assert.match(
      harness.stdout,
      /^✖ \d+ problems? \(\d+ errors?, \d+ warnings?\)$/m,
    );
  });
});
