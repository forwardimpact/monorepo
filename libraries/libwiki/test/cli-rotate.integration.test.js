import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runRotateCommand } from "../src/commands/rotate.js";
import { weeklyLogPath } from "../src/weekly-log.js";
import { makeRuntime, ctxFor } from "./helpers.js";

// rotateIfOverBudget seals via fs.renameSync, which createMockFs does not
// model — so this drives the real fs under a temp dir, like cli-fix.
describe("fit-wiki rotate CLI (in-process)", () => {
  let dir;
  let wikiRoot;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rotate-cli-"));
    wikiRoot = join(dir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const run = (
    today = "2026-05-24",
    agent = "staff-engineer",
    force = false,
  ) => {
    const harness = makeRuntime({ cwd: dir });
    const result = runRotateCommand(
      ctxFor({
        runtime: harness.runtime,
        options: { agent, "wiki-root": wikiRoot, today, force },
      }),
    );
    return { result, harness };
  };

  function multiDayLog(
    title = "Staff Engineer",
    sections = 4,
    linesPerSection = 150,
  ) {
    let text = `# ${title} — 2026-W21\n`;
    for (let s = 0; s < sections; s++) {
      const day = String(18 + s).padStart(2, "0");
      text += `## 2026-05-${day}\n`;
      for (let i = 1; i < linesPerSection; i++) text += "filler\n";
    }
    return text;
  }

  test("seals a multi-day over-cap log into parts, prints each, exits 0", () => {
    const logPath = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-24");
    writeFileSync(logPath, multiDayLog());
    const { result, harness } = run();
    assert.deepEqual(result, { ok: true });
    const printed = harness.stdout.match(/^sealed → .*-part\d+\.md$/gm) || [];
    assert.ok(printed.length >= 2, "prints each sealed part");
    assert.ok(
      existsSync(join(wikiRoot, "staff-engineer-2026-W21-part1.md")),
      "part1 sealed",
    );
    assert.ok(existsSync(logPath), "fresh main created");
  });

  test("a missing target exits 2 and names the absent file", () => {
    // A typo'd agent (or a target that was already rotated away) must fail
    // closed rather than report a silent success.
    const { result } = run();
    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
    assert.match(result.error, /no weekly log for staff-engineer at .*\.md$/);
  });

  test("an under-budget target exits 2 unless --force seals it", () => {
    const logPath = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-24");
    writeFileSync(
      logPath,
      "# Staff Engineer — 2026-W21\n## 2026-05-18\nshort\n",
    );

    const refused = run();
    assert.equal(refused.result.ok, false);
    assert.equal(refused.result.code, 2);
    assert.match(
      refused.result.error,
      /is under budget \(\d+ lines, \d+ words\); pass --force to seal it early/,
    );
    assert.equal(
      existsSync(join(wikiRoot, "staff-engineer-2026-W21-part1.md")),
      false,
      "no part minted on the refused run",
    );

    const forced = run("2026-05-24", "staff-engineer", true);
    assert.deepEqual(forced.result, { ok: true });
    assert.ok(
      existsSync(join(wikiRoot, "staff-engineer-2026-W21-part1.md")),
      "--force seals the under-budget log above the floor",
    );
  });

  test("prints the resolved target before any seal output", () => {
    const logPath = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-24");
    writeFileSync(logPath, multiDayLog());
    const { harness } = run();
    const lines = harness.stdout.trim().split("\n");
    assert.match(lines[0], /^target → .*staff-engineer-2026-W21\.md$/);
  });

  test("a header-only log is a zero-exit noop, and --force cannot override the floor (#1581)", () => {
    const logPath = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-24");
    writeFileSync(logPath, "# Staff Engineer — 2026-W21\n");
    const { result, harness } = run("2026-05-24", "staff-engineer", true);
    assert.deepEqual(result, { ok: true });
    assert.match(harness.stdout, /no rotation needed for staff-engineer/);
    assert.equal(
      existsSync(join(wikiRoot, "staff-engineer-2026-W21-part1.md")),
      false,
      "no empty part minted, even under --force",
    );
  });

  test("#1581 repro: never touches a sibling's log, and a repeat --force run mints nothing", () => {
    // The incident shape: the audit flags product-manager's log, but rotate is
    // invoked as staff-engineer. The PM file must be left byte-identical. The
    // deliberate early seal now needs --force; the second invocation — against
    // the freshly-reset header-only staff-engineer main — is a floor noop, so
    // no empty part is minted.
    const pmSource = multiDayLog("Product Manager");
    const pmLog = weeklyLogPath(wikiRoot, "product-manager", "2026-05-24");
    writeFileSync(pmLog, pmSource);
    const seLog = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-24");
    writeFileSync(seLog, "# Staff Engineer — 2026-W21\n## 2026-05-18\nshort\n");

    const first = run("2026-05-24", "staff-engineer", true);
    assert.deepEqual(first.result, { ok: true });
    assert.match(
      first.harness.stdout,
      /target → .*staff-engineer-2026-W21\.md/,
    );
    assert.ok(
      existsSync(join(wikiRoot, "staff-engineer-2026-W21-part1.md")),
      "an under-budget log seals under --force",
    );
    assert.equal(readFileSync(pmLog, "utf-8"), pmSource, "sibling untouched");

    const second = run("2026-05-24", "staff-engineer", true);
    assert.deepEqual(second.result, { ok: true });
    assert.match(second.harness.stdout, /no rotation needed/);
    assert.equal(
      existsSync(join(wikiRoot, "staff-engineer-2026-W21-part2.md")),
      false,
      "no junk part minted on the repeat run (floor holds under --force)",
    );
  });

  test("an irreducible single-day section exits 1 and names the section", () => {
    let text = "# Staff Engineer — 2026-W21\n## 2026-05-18\nx\n## 2026-05-19\n";
    for (let i = 0; i < 600; i++) text += "filler\n";
    writeFileSync(
      weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-24"),
      text,
    );
    const { result, harness } = run();
    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(harness.stderr, /section 2026-05-19 alone exceeds the budget/);
    assert.match(harness.stderr, /recover it by hand/);
  });

  test("force-rotate splits a lone over-cap day at its ### block seams (force path)", () => {
    // One dated entry over the line cap, built from 4 `### ` blocks none of
    // which alone exceeds the cap. `fit-wiki rotate` must sub-split the day.
    let text = "# Staff Engineer — 2026-W21\n## 2026-05-19\n";
    for (let b = 1; b <= 4; b++) {
      text += `### Block ${b}\n`;
      for (let i = 1; i < 150; i++) text += "filler\n";
    }
    writeFileSync(
      weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-24"),
      text,
    );
    const { result, harness } = run();
    assert.deepEqual(result, { ok: true }, "the day is split, not irreducible");
    assert.match(harness.stdout, /sealed → /);
    // ≥2 conforming parts exist; none over the line budget.
    assert.ok(existsSync(join(wikiRoot, "staff-engineer-2026-W21-part2.md")));
    for (const n of [1, 2]) {
      const part = readFileSync(
        join(wikiRoot, `staff-engineer-2026-W21-part${n}.md`),
        "utf-8",
      );
      assert.ok(part.split("\n").length - 1 <= 496);
    }
  });
});
