import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as nodeFs from "node:fs";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  isoWeek,
  weeklyLogPath,
  rotateIfOverBudget,
  appendEntry,
} from "../src/weekly-log.js";
import { WEEKLY_LOG_LINE_BUDGET } from "../src/constants.js";

describe("isoWeek", () => {
  test("2026-01-04 is W01", () => {
    const { year, week } = isoWeek(new Date("2026-01-04T00:00:00Z"));
    assert.equal(year, 2026);
    assert.equal(week, 1);
  });
  test("2026-05-19 is W21", () => {
    const { year, week } = isoWeek(new Date("2026-05-19T00:00:00Z"));
    assert.equal(year, 2026);
    assert.equal(week, 21);
  });
  test("2025-12-29 belongs to ISO 2026-W01 (year rolls forward)", () => {
    const { year, week } = isoWeek(new Date("2025-12-29T00:00:00Z"));
    assert.equal(year, 2026);
    assert.equal(week, 1);
  });
  test("2024-12-30 belongs to ISO 2025-W01 (year rolls forward)", () => {
    const { year, week } = isoWeek(new Date("2024-12-30T00:00:00Z"));
    assert.equal(year, 2025);
    assert.equal(week, 1);
  });
  test("2027-01-01 belongs to ISO 2026-W53 (year rolls back; 2026 has 53 ISO weeks)", () => {
    const { year, week } = isoWeek(new Date("2027-01-01T00:00:00Z"));
    assert.equal(year, 2026);
    assert.equal(week, 53);
  });
  test("2026-12-31 is 2026-W53", () => {
    const { year, week } = isoWeek(new Date("2026-12-31T00:00:00Z"));
    assert.equal(year, 2026);
    assert.equal(week, 53);
  });
});

describe("rotateIfOverBudget", () => {
  let wikiRoot;
  beforeEach(() => {
    wikiRoot = mkdtempSync(join(tmpdir(), "weekly-log-"));
  });
  afterEach(() => rmSync(wikiRoot, { recursive: true, force: true }));

  test("no-op when file does not exist", () => {
    const r = rotateIfOverBudget(
      wikiRoot,
      "staff-engineer",
      "2026-05-19",
      0,
      {},
      nodeFs,
    );
    assert.equal(r.rotated, false);
  });

  test("rotates when over budget", () => {
    const filePath = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-19");
    const big = "x\n".repeat(WEEKLY_LOG_LINE_BUDGET + 5);
    writeFileSync(filePath, big);
    const r = rotateIfOverBudget(
      wikiRoot,
      "staff-engineer",
      "2026-05-19",
      1,
      {},
      nodeFs,
    );
    assert.equal(r.rotated, true);
    assert.match(r.toPath, /-part1\.md$/);
    assert.equal(existsSync(filePath), true, "fresh file created");
    assert.equal(existsSync(r.toPath), true, "sealed part exists");
    assert.equal(
      readFileSync(r.toPath, "utf-8"),
      big,
      "sealed part preserves prior content byte-for-byte",
    );
  });

  test("part numbering increments", () => {
    const filePath = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-19");
    writeFileSync(filePath, "x\n".repeat(WEEKLY_LOG_LINE_BUDGET + 5));
    rotateIfOverBudget(wikiRoot, "staff-engineer", "2026-05-19", 1, {}, nodeFs);
    writeFileSync(filePath, "x\n".repeat(WEEKLY_LOG_LINE_BUDGET + 5));
    const r2 = rotateIfOverBudget(
      wikiRoot,
      "staff-engineer",
      "2026-05-19",
      1,
      {},
      nodeFs,
    );
    assert.match(r2.toPath, /-part2\.md$/);
  });

  test("force rotates even when under budget", () => {
    const filePath = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-19");
    writeFileSync(filePath, "small\n");
    const r = rotateIfOverBudget(
      wikiRoot,
      "staff-engineer",
      "2026-05-19",
      0,
      {
        force: true,
      },
      nodeFs,
    );
    assert.equal(r.rotated, true);
  });
});

describe("appendEntry", () => {
  let wikiRoot;
  beforeEach(() => {
    wikiRoot = mkdtempSync(join(tmpdir(), "weekly-log-"));
  });
  afterEach(() => rmSync(wikiRoot, { recursive: true, force: true }));

  test("creates the file with an H1 when missing", () => {
    const filePath = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-19");
    appendEntry(
      filePath,
      "## 2026-05-19\n\n### Decision\nbody",
      "staff-engineer",
      "2026-05-19",
      nodeFs,
    );
    const content = readFileSync(filePath, "utf-8");
    assert.match(content, /^# Staff Engineer — 2026-W21/);
    assert.match(content, /## 2026-05-19/);
  });
});
