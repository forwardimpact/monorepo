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

  const run = (today = "2026-05-24", agent = "staff-engineer") => {
    const harness = makeRuntime({ cwd: dir });
    const result = runRotateCommand(
      ctxFor({
        runtime: harness.runtime,
        options: { agent, "wiki-root": wikiRoot, today },
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

  test("no rotation needed (missing file) prints a message and exits 0", () => {
    // The CLI forces, so an existing file with content always seals; the noops
    // are the missing-file and header-only paths.
    const { result, harness } = run();
    assert.deepEqual(result, { ok: true });
    assert.match(harness.stdout, /no rotation needed for staff-engineer/);
  });

  test("prints the resolved target before any seal output", () => {
    const logPath = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-24");
    writeFileSync(logPath, multiDayLog());
    const { harness } = run();
    const lines = harness.stdout.trim().split("\n");
    assert.match(lines[0], /^target → .*staff-engineer-2026-W21\.md$/);
  });

  test("a header-only log is a noop even though the CLI forces (#1581)", () => {
    const logPath = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-24");
    writeFileSync(logPath, "# Staff Engineer — 2026-W21\n");
    const { result, harness } = run();
    assert.deepEqual(result, { ok: true });
    assert.match(harness.stdout, /no rotation needed for staff-engineer/);
    assert.equal(
      existsSync(join(wikiRoot, "staff-engineer-2026-W21-part1.md")),
      false,
      "no empty part minted",
    );
  });

  test("#1581 repro: never touches a sibling's over-budget log, and a repeat run mints nothing", () => {
    // The incident shape: the audit flags product-manager's log, but rotate is
    // invoked as staff-engineer. The PM file must be left byte-identical, and
    // the second invocation — against the freshly-reset staff-engineer main —
    // must noop instead of minting an empty part.
    const pmSource = multiDayLog("Product Manager");
    const pmLog = weeklyLogPath(wikiRoot, "product-manager", "2026-05-24");
    writeFileSync(pmLog, pmSource);
    const seLog = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-24");
    writeFileSync(seLog, "# Staff Engineer — 2026-W21\n## 2026-05-18\nshort\n");

    const first = run();
    assert.deepEqual(first.result, { ok: true });
    assert.match(
      first.harness.stdout,
      /target → .*staff-engineer-2026-W21\.md/,
    );
    assert.ok(
      existsSync(join(wikiRoot, "staff-engineer-2026-W21-part1.md")),
      "a non-empty under-budget log still force-seals",
    );
    assert.equal(readFileSync(pmLog, "utf-8"), pmSource, "sibling untouched");

    const second = run();
    assert.deepEqual(second.result, { ok: true });
    assert.match(second.harness.stdout, /no rotation needed/);
    assert.equal(
      existsSync(join(wikiRoot, "staff-engineer-2026-W21-part2.md")),
      false,
      "no junk part minted on the repeat run",
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
    assert.match(
      harness.stderr,
      /day-section 2026-05-19 alone exceeds the budget/,
    );
    assert.match(harness.stderr, /recover it by hand/);
  });
});
