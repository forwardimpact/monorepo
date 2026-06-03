import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs } from "@forwardimpact/libmock";
import { isoWeek, weeklyLogPath, appendEntry } from "../src/weekly-log.js";

const WIKI_ROOT = "/wiki";

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

describe("appendEntry", () => {
  test("creates the file with an H1 when missing", () => {
    const fs = createMockFs();
    const filePath = weeklyLogPath(WIKI_ROOT, "staff-engineer", "2026-05-19");
    appendEntry(
      filePath,
      "## 2026-05-19\n\n### Decision\nbody",
      "staff-engineer",
      "2026-05-19",
      fs,
    );
    const content = fs.readFileSync(filePath, "utf-8");
    assert.match(content, /^# Staff Engineer — 2026-W21/);
    assert.match(content, /## 2026-05-19/);
  });
});
