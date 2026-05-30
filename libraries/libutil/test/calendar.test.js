import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  isoDate,
  isoWeek,
  isoWeekString,
  yearMonth,
  addDays,
} from "../src/calendar.js";

describe("calendar", () => {
  test("isoDate formats a ms timestamp, Date, and ISO string identically", () => {
    const ms = Date.UTC(2026, 4, 30, 13, 0, 0);
    assert.equal(isoDate(ms), "2026-05-30");
    assert.equal(isoDate(new Date(ms)), "2026-05-30");
    assert.equal(isoDate("2026-05-30"), "2026-05-30");
  });

  test("isoWeek anchors on the Thursday of the week", () => {
    // 2026-05-30 is a Saturday in ISO week 22.
    assert.deepEqual(isoWeek("2026-05-30"), { year: 2026, week: 22 });
    // 2027-01-01 is a Friday belonging to ISO week 53 of 2026.
    assert.deepEqual(isoWeek("2027-01-01"), { year: 2026, week: 53 });
  });

  test("isoWeekString zero-pads the week", () => {
    assert.equal(isoWeekString("2026-05-30"), "2026-W22");
    assert.equal(isoWeekString("2026-01-05"), "2026-W02");
  });

  test("yearMonth zero-pads the UTC month", () => {
    assert.equal(yearMonth("2026-05-30"), "2026-M05");
    assert.equal(yearMonth("2026-11-01"), "2026-M11");
  });

  test("addDays shifts forward and backward without mutating the input", () => {
    const d = new Date(Date.UTC(2026, 4, 30));
    assert.equal(addDays("2026-05-30", 7), "2026-06-06");
    assert.equal(addDays("2026-05-30", -9), "2026-05-21");
    addDays(d, 5);
    assert.equal(d.getUTCDate(), 30, "input Date must not be mutated");
  });
});
