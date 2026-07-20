import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as nodeFs from "node:fs";
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

import { runRules } from "@forwardimpact/libutil";
import { runLogCommand } from "../src/commands/log.js";
import { weeklyLogPath } from "../src/weekly-log.js";
import { countLines, countWords } from "../src/budget.js";
import { RULES } from "../src/audit/rules.js";
import { buildContext, resolveScope } from "../src/audit/scopes.js";
import {
  WEEKLY_LOG_LINE_BUDGET,
  WEEKLY_LOG_WORD_BUDGET,
} from "../src/constants.js";
import { makeRuntime, ctxFor } from "./helpers.js";

// Run the real audit engine over `wikiRoot` and return only the weekly-log
// fail findings — what "gemba-wiki audit passes on the result" means for the
// rotated file under test (criterion 1), without seeding MEMORY/STATUS/storyboard.
function weeklyLogAuditFails(wikiRoot, today, fs) {
  const ctx = buildContext({ wikiRoot, today, fs });
  return runRules(RULES, ctx, { resolveScope }).filter(
    (f) => f.level === "fail" && f.id.startsWith("weekly-log"),
  );
}

// The append path seals via fs.renameSync (no createMockFs renameSync), so the
// rotate-then-append behaviour is exercised against the real fs here; the
// mock-backed cli-log.test.js covers the under-budget (no-seal) cases.
describe("gemba-wiki log CLI seal-on-append (in-process)", () => {
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

  test("note shares the seal-then-append path and lands in a fresh current log", () => {
    const today = "2026-05-24";
    const logPath = weeklyLogPath(wikiRoot, "staff-engineer", today);
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
          field: "Findings",
          body: "all clean",
        },
        args: { subcommand: "note" },
      }),
    );

    assert.deepEqual(result, { ok: true });
    assert.ok(
      existsSync(join(wikiRoot, "staff-engineer-2026-W21-part1.md")),
      "the over-cap log is sealed before the note appends",
    );
    const fresh = readFileSync(logPath, "utf-8");
    assert.match(fresh, /^# Staff Engineer — 2026-W21\n/);
    assert.match(fresh, /### Findings/);
    assert.ok(fresh.split("\n").length - 1 <= WEEKLY_LOG_LINE_BUDGET);
  });

  test("append over only the word cap rotates first, then lands", () => {
    const today = "2026-05-24"; // ISO 2026-W21
    const logPath = weeklyLogPath(wikiRoot, "staff-engineer", today);
    // ~474 lines (under the 496 line cap) but ~6117 words (near the 6400 word
    // cap); the next note tips words over 6400 with lines still under, so only
    // the word-budget trigger can fire the seal (word-cap rotation, not just
    // the line-cap path).
    const rows = ["# Staff Engineer — 2026-W21", "", "## 2026-05-24", ""];
    for (let i = 0; i < 470; i++) rows.push(Array(13).fill("w").join(" "));
    writeFileSync(logPath, rows.join("\n") + "\n");

    const harness = makeRuntime({ cwd: dir });
    const result = runLogCommand(
      ctxFor({
        runtime: harness.runtime,
        options: {
          agent: "staff-engineer",
          "wiki-root": wikiRoot,
          today,
          field: "Followup",
          body: Array(80).fill("more words here today").join(" "),
        },
        args: { subcommand: "note" },
      }),
    );

    assert.deepEqual(result, { ok: true });
    assert.ok(
      existsSync(join(wikiRoot, "staff-engineer-2026-W21-part1.md")),
      "word-cap rotation sealed a part before the note appended",
    );
    const fresh = readFileSync(logPath, "utf-8");
    assert.match(fresh, /Followup/);
    // The real audit passes on the rotated result — the spec's stated verify,
    // not a budget recount (criterion 1).
    assert.deepEqual(
      weeklyLogAuditFails(wikiRoot, today, nodeFs),
      [],
      "gemba-wiki audit passes on the word-cap-rotated result",
    );
  });

  test("append against a lone over-cap day with ### blocks splits at block seams (criterion 2, append path)", () => {
    const today = "2026-05-24"; // ISO 2026-W21
    const logPath = weeklyLogPath(wikiRoot, "staff-engineer", today);
    // One dated entry, over the line cap, built from 4 `### ` blocks none of
    // which alone exceeds the cap. The append-path rotation must split it at the
    // block seams rather than report it irreducible.
    let text = "# Staff Engineer — 2026-W21\n## 2026-05-24\n";
    for (let b = 1; b <= 4; b++) {
      text += `### Block ${b}\n`;
      for (let i = 1; i < 150; i++) text += "filler\n";
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
          field: "Findings",
          body: "next entry",
        },
        args: { subcommand: "note" },
      }),
    );

    assert.deepEqual(result, { ok: true });
    assert.ok(
      existsSync(join(wikiRoot, "staff-engineer-2026-W21-part1.md")),
      "the over-cap day was sealed (split at its block seams) before the note",
    );
    // The whole result passes the audit — the day was reduced, not irreducible.
    assert.deepEqual(
      weeklyLogAuditFails(wikiRoot, today, nodeFs),
      [],
      "gemba-wiki audit passes after sub-entry rotation on the append path",
    );
  });
});
