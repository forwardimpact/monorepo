import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runLogCommand } from "../src/commands/log.js";
import { weeklyLogPath } from "../src/weekly-log.js";
import { WEEKLY_LOG_LINE_BUDGET } from "../src/constants.js";
import { makeRuntime, ctxFor } from "./helpers.js";

// The append path seals via fs.renameSync (no createMockFs renameSync), so the
// rotate-then-append behaviour is exercised against the real fs here; the
// mock-backed cli-log.test.js covers the under-budget (no-seal) cases.
describe("fit-wiki log CLI seal-on-append (in-process)", () => {
  let dir;
  let wikiRoot;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "log-cli-"));
    wikiRoot = join(dir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("decision against an over-line-budget multi-day log bisects, then appends fresh", () => {
    const today = "2026-05-24"; // ISO 2026-W21
    const logPath = weeklyLogPath(wikiRoot, "staff-engineer", today);
    // 4 day-sections @ 150 lines: each under budget, jointly over the line
    // budget so the append path's non-force short-circuit triggers a seal.
    let text = "# Staff Engineer — 2026-W21\n";
    for (let s = 0; s < 4; s++) {
      text += `## 2026-05-${String(18 + s).padStart(2, "0")}\n`;
      for (let i = 1; i < 150; i++) text += "- filler\n";
    }
    writeFileSync(logPath, text);

    const harness = makeRuntime({ cwd: dir });
    const result = runLogCommand(
      ctxFor({
        runtime: harness.runtime,
        options: {
          agent: "staff-engineer",
          "wiki-root": wikiRoot,
          today,
          surveyed: "owned",
          chosen: "ship it",
          rationale: "merged plan",
        },
        args: { subcommand: "decision" },
      }),
    );

    assert.deepEqual(result, { ok: true });
    // The prior content is sealed into ≥2 conforming parts.
    assert.ok(
      existsSync(join(wikiRoot, "staff-engineer-2026-W21-part1.md")) &&
        existsSync(join(wikiRoot, "staff-engineer-2026-W21-part2.md")),
      "sealed into ≥2 parts",
    );
    for (const n of [1, 2]) {
      const part = readFileSync(
        join(wikiRoot, `staff-engineer-2026-W21-part${n}.md`),
        "utf-8",
      );
      assert.ok(
        part.split("\n").length - 1 <= WEEKLY_LOG_LINE_BUDGET,
        `part${n} conforms to the line budget`,
      );
    }
    // The new dated entry opens in a fresh, small current file.
    const fresh = readFileSync(logPath, "utf-8");
    assert.match(fresh, /^# Staff Engineer — 2026-W21\n/);
    assert.match(fresh, /## 2026-05-24/);
    assert.match(fresh, /### Decision/);
    assert.ok(
      fresh.split("\n").length - 1 <= WEEKLY_LOG_LINE_BUDGET,
      "the fresh current log is well under budget",
    );
  });
});
