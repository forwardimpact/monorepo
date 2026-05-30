import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runBootCommand } from "../src/commands/boot.js";
import { makeRuntime, ctxFor } from "./helpers.js";

describe("fit-wiki boot CLI (in-process)", () => {
  let dir;
  let wikiRoot;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "boot-cli-"));
    wikiRoot = join(dir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });
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

  function run(options) {
    const harness = makeRuntime({ cwd: dir });
    const result = runBootCommand(
      ctxFor({
        runtime: harness.runtime,
        options: { "wiki-root": wikiRoot, agent: "staff-engineer", ...options },
      }),
    );
    return { harness, result };
  }

  test("prints JSON digest", () => {
    const { harness } = run({ today: "2026-05-19" });
    const digest = JSON.parse(harness.stdout);
    assert.equal(typeof digest.summary, "string");
    assert.ok(Array.isArray(digest.owned_priorities));
    assert.ok(Array.isArray(digest.claims));
  });

  test("markdown format emits human-readable output", () => {
    const { harness } = run({ today: "2026-05-19", format: "markdown" });
    assert.match(harness.stdout, /# Boot Digest/);
  });
});
