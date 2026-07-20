import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs } from "@forwardimpact/libmock";

import { runAuditCommand } from "../src/commands/audit.js";
import { makeRuntime, ctxFor } from "./helpers.js";

const PROJECT_ROOT = "/project";
const WIKI_ROOT = `${PROJECT_ROOT}/wiki`;
// A finder stub so the audit command resolves a fixed project root (the text
// emitter relativizes finding paths against it → "wiki/<file>").
const FINDER = { findProjectRoot: () => PROJECT_ROOT };
const STORYBOARD_AGENTS = [
  "product-manager",
  "release-engineer",
  "security-engineer",
  "staff-engineer",
  "technical-writer",
];

// The clean-wiki seed every case starts from. `extra` overlays additional
// wiki files (e.g. an over-budget summary). audit reads these via runtime.fsSync;
// `wiki-root` is passed explicitly so no real project tree is consulted.
function cleanWiki(extra = {}) {
  return createMockFs({
    [`${WIKI_ROOT}/MEMORY.md`]: [
      "## Cross-Cutting Priorities",
      "",
      "| Item | Agents | Owner | Status | Added |",
      "| --- | --- | --- | --- | --- |",
      "| *None* | — | — | — | — |",
      "",
    ].join("\n"),
    [`${WIKI_ROOT}/storyboard-2026-M05.md`]: [
      "# Storyboard — 2026-05",
      "",
      ...STORYBOARD_AGENTS.map((a) => `### ${a}`),
      "",
    ].join("\n"),
    ...extra,
  });
}

describe("gemba-wiki audit CLI (in-process)", () => {
  function run(fsSync, options) {
    const harness = makeRuntime({ fsSync, finder: FINDER });
    const result = runAuditCommand(
      ctxFor({
        runtime: harness.runtime,
        options: { today: "2026-05-24", ...options },
      }),
    );
    return { harness, result };
  }

  const OVER_BUDGET = {
    [`${WIKI_ROOT}/staff-engineer.md`]: `# Staff Engineer — Summary\n\n**Last run**: nothing.\n\n## Message Inbox\n\n<!-- memo:inbox -->\n\n${Array(600).fill("x").join("\n")}\n`,
  };

  test("clean wiki: JSON shape and exit 0", () => {
    const { harness, result } = run(cleanWiki(), { format: "json" });
    assert.equal(result.ok, true);
    const parsed = JSON.parse(harness.stdout);
    assert.equal(parsed.result, "pass");
    assert.deepEqual(parsed.failures, []);
    assert.deepEqual(parsed.warnings, []);
  });

  test("over-budget summary: JSON failure with id, path, exit 1", () => {
    const { harness, result } = run(cleanWiki(OVER_BUDGET), { format: "json" });
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
    const { harness, result } = run(cleanWiki(OVER_BUDGET), {});
    assert.equal(result.code, 1);
    assert.match(harness.stdout, /^wiki\/staff-engineer\.md$/m);
    assert.match(harness.stdout, /^ +\d* +error +.+ +summary\.line-budget$/m);
    assert.match(
      harness.stdout,
      /^✖ \d+ problems? \(\d+ errors?, \d+ warnings?\)$/m,
    );
  });
});
