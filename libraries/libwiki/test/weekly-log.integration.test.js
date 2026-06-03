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
import { weeklyLogPath, rotateIfOverBudget } from "../src/weekly-log.js";
import { WEEKLY_LOG_LINE_BUDGET } from "../src/constants.js";

// rotateIfOverBudget seals the over-budget file via fs.renameSync, which the
// in-memory libmock fs does not model (it ships async `rename` only). Until that
// sync surface exists this stays an integration test against the real fs.
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
