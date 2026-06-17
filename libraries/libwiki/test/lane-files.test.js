import { test, describe } from "node:test";
import assert from "node:assert";

import { isLaneFile } from "../src/lane-files.js";

describe("isLaneFile", () => {
  const agent = "staff-engineer";

  test("matches the agent summary", () => {
    assert.ok(isLaneFile("staff-engineer.md", agent));
  });

  test("matches a weekly main log for the agent", () => {
    assert.ok(isLaneFile("staff-engineer-2026-W21.md", agent));
  });

  test("matches a sealed weekly part for the agent", () => {
    assert.ok(isLaneFile("staff-engineer-2026-W21-part3.md", agent));
  });

  test("rejects another agent's weekly log", () => {
    assert.ok(!isLaneFile("product-manager-2026-W21.md", agent));
  });

  test("rejects another agent's summary", () => {
    assert.ok(!isLaneFile("product-manager.md", agent));
  });

  test("matches a metrics CSV for any agent (author-scoped elsewhere)", () => {
    assert.ok(isLaneFile("metrics/kata-design/2026.csv", agent));
  });

  test("rejects an unrelated file", () => {
    assert.ok(!isLaneFile("MEMORY.md", agent));
    assert.ok(!isLaneFile("STATUS.md", agent));
  });
});
