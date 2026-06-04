import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as nodeFs from "node:fs";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  statSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { weeklyLogPath, rotateIfOverBudget } from "../src/weekly-log.js";
import { WEEKLY_LOG_LINE_BUDGET } from "../src/constants.js";

// rotateIfOverBudget seals via fs.renameSync, which the in-memory libmock fs
// does not model (it ships async `rename` only). Until that sync surface
// exists this stays an integration test against the real fs.
describe("rotateIfOverBudget", () => {
  let wikiRoot;
  beforeEach(() => {
    wikiRoot = mkdtempSync(join(tmpdir(), "weekly-log-"));
  });
  afterEach(() => rmSync(wikiRoot, { recursive: true, force: true }));

  const AGENT = "staff-engineer";
  const WEEK = "2026-05-19"; // ISO 2026-W21

  // A multi-day source over the line budget: each section is under the cap but
  // jointly they overflow, so a bisecting seal yields ≥2 conforming parts.
  function multiDaySource(sections = 4, linesPerSection = 150) {
    let text = `# Staff Engineer — 2026-W21\n`;
    for (let s = 0; s < sections; s++) {
      const day = String(18 + s).padStart(2, "0");
      text += `## 2026-05-${day}\n`;
      for (let i = 1; i < linesPerSection; i++) text += `filler\n`;
    }
    return text;
  }

  test("noop when file does not exist", () => {
    const r = rotateIfOverBudget(wikiRoot, AGENT, WEEK, 0, {}, nodeFs);
    assert.equal(r.status, "noop");
  });

  test("noop when under budget on the non-force append path", () => {
    const filePath = weeklyLogPath(wikiRoot, AGENT, WEEK);
    writeFileSync(filePath, "# Staff Engineer — 2026-W21\n\nsmall\n");
    const r = rotateIfOverBudget(wikiRoot, AGENT, WEEK, 1, {}, nodeFs);
    assert.equal(r.status, "noop");
  });

  test("seals an over-budget multi-day source into ≥2 conforming parts", () => {
    const filePath = weeklyLogPath(wikiRoot, AGENT, WEEK);
    writeFileSync(filePath, multiDaySource());
    const r = rotateIfOverBudget(wikiRoot, AGENT, WEEK, 1, {}, nodeFs);
    assert.equal(r.status, "sealed");
    assert.ok(r.parts.length >= 2, "splits into multiple parts");
    for (const p of r.parts) {
      assert.match(p, /-part\d+\.md$/);
      assert.ok(
        readFileSync(p, "utf-8").split("\n").length - 1 <=
          WEEKLY_LOG_LINE_BUDGET,
        "each part is at-or-under the line budget",
      );
    }
    assert.equal(existsSync(filePath), true, "fresh main created");
    assert.match(
      readFileSync(filePath, "utf-8"),
      /^# Staff Engineer — 2026-W21\n$/,
    );
  });

  test("force seals into conforming parts without a born-over-cap part", () => {
    const filePath = weeklyLogPath(wikiRoot, AGENT, WEEK);
    writeFileSync(filePath, multiDaySource());
    const r = rotateIfOverBudget(
      wikiRoot,
      AGENT,
      WEEK,
      0,
      { force: true },
      nodeFs,
    );
    assert.equal(r.status, "sealed");
    assert.ok(r.parts.length >= 2);
  });

  test("part slots continue past existing parts", () => {
    const filePath = weeklyLogPath(wikiRoot, AGENT, WEEK);
    writeFileSync(
      join(wikiRoot, "staff-engineer-2026-W21-part1.md"),
      "# old\n",
    );
    writeFileSync(filePath, multiDaySource());
    const r = rotateIfOverBudget(wikiRoot, AGENT, WEEK, 1, {}, nodeFs);
    assert.equal(r.status, "sealed");
    assert.match(
      r.parts[0],
      /-part2\.md$/,
      "new parts start at the next free slot",
    );
  });

  test("incomplete when a lone day-section exceeds the budget", () => {
    const filePath = weeklyLogPath(wikiRoot, AGENT, WEEK);
    let text = "# Staff Engineer — 2026-W21\n## 2026-05-18\nx\n## 2026-05-19\n";
    for (let i = 0; i < 600; i++) text += "filler\n";
    text += "## 2026-05-20\nx\n";
    writeFileSync(filePath, text);
    const r = rotateIfOverBudget(
      wikiRoot,
      AGENT,
      WEEK,
      0,
      { force: true },
      nodeFs,
    );
    assert.equal(r.status, "incomplete");
    assert.equal(r.residue.section, "2026-05-19");
    assert.ok(
      r.parts.includes(r.residue.path),
      "residue path is among the parts",
    );
    assert.ok(r.residue.lines > WEEKLY_LOG_LINE_BUDGET);
  });

  test("atomic: a mid-commit rename failure leaves the source intact", () => {
    const filePath = weeklyLogPath(wikiRoot, AGENT, WEEK);
    const original = multiDaySource();
    writeFileSync(filePath, original);
    const inodeBefore = statSync(filePath).ino;

    // Wrap real fs but make the SECOND renameSync throw, so ≥1 slot is already
    // committed when the failure hits — exercising the slot-unlink rollback.
    let renames = 0;
    const flakyFs = {
      existsSync: nodeFs.existsSync,
      readFileSync: nodeFs.readFileSync,
      writeFileSync: nodeFs.writeFileSync,
      unlinkSync: nodeFs.unlinkSync,
      renameSync: (from, to) => {
        renames++;
        if (renames === 2) throw new Error("disk full");
        return nodeFs.renameSync(from, to);
      },
    };

    assert.throws(
      () => rotateIfOverBudget(wikiRoot, AGENT, WEEK, 1, {}, flakyFs),
      /disk full/,
    );
    assert.equal(
      readFileSync(filePath, "utf-8"),
      original,
      "source contents intact",
    );
    assert.equal(statSync(filePath).ino, inodeBefore, "source inode unchanged");
    const leftover = readdirSync(wikiRoot).filter(
      (f) => f.includes("-part") || f.endsWith(".tmp"),
    );
    assert.deepEqual(
      leftover,
      [],
      "no part or temp files survive the rollback",
    );
  });
});
