import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runFixCommand } from "../src/commands/fix.js";
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

describe("fit-wiki fix CLI (in-process)", () => {
  let dir;
  let wikiRoot;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fix-cli-"));
    wikiRoot = join(dir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });
    writeFileSync(join(dir, "package.json"), '{"name":"root"}');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("clean wiki: prints 'nothing to fix' and exits 0", async () => {
    seedCleanWiki(wikiRoot);
    const harness = makeRuntime({ cwd: dir });
    const result = await runFixCommand(
      ctxFor({ runtime: harness.runtime, options: { today: "2026-05-24" } }),
    );
    assert.deepEqual(result, { ok: true });
    assert.match(harness.stdout, /nothing to fix/);
  });
});
