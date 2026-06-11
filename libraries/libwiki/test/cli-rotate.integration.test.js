import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
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

  const run = (today = "2026-05-24") => {
    const harness = makeRuntime({ cwd: dir });
    const result = runRotateCommand(
      ctxFor({
        runtime: harness.runtime,
        options: { agent: "staff-engineer", "wiki-root": wikiRoot, today },
      }),
    );
    return { result, harness };
  };

  function multiDayLog(sections = 4, linesPerSection = 150) {
    let text = "# Staff Engineer — 2026-W21\n";
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
    // The CLI forces, so a non-empty existing file always seals; the genuine
    // noops are the missing-file and header-only paths.
    const { result, harness } = run();
    assert.deepEqual(result, { ok: true });
    assert.match(harness.stdout, /no rotation needed for staff-engineer/);
  });

  test("prints the resolved target before sealing", () => {
    const logPath = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-24");
    writeFileSync(logPath, multiDayLog());
    const { harness } = run();
    const targetAt = harness.stdout.indexOf(`target: ${logPath}`);
    const sealedAt = harness.stdout.indexOf("sealed →");
    assert.ok(targetAt !== -1, "echoes the resolved target path");
    assert.ok(targetAt < sealedAt, "target precedes the seal output");
  });

  test("a header-only log is a noop, not an empty part (floor guard)", () => {
    const logPath = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-24");
    writeFileSync(logPath, "# Staff Engineer — 2026-W21\n");
    const { result, harness } = run();
    assert.deepEqual(result, { ok: true });
    assert.match(harness.stdout, /no rotation needed for staff-engineer/);
    assert.ok(
      !existsSync(join(wikiRoot, "staff-engineer-2026-W21-part1.md")),
      "no part minted",
    );
  });

  test("a repeat rotate after sealing is a noop (no junk part)", () => {
    // The #1581 incident shape: the first rotate seals and resets the main to
    // a fresh H1; a second rotate must not seal the header-only main again.
    const logPath = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-24");
    writeFileSync(logPath, multiDayLog());
    run();
    const partsAfterFirst = readdirSync(wikiRoot).filter((f) =>
      /-part\d+\.md$/.test(f),
    );
    const { result, harness } = run();
    assert.deepEqual(result, { ok: true });
    assert.match(harness.stdout, /no rotation needed for staff-engineer/);
    assert.deepEqual(
      readdirSync(wikiRoot).filter((f) => /-part\d+\.md$/.test(f)),
      partsAfterFirst,
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
