import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  COVERAGE_CONFIDENCE_FLOOR,
  isBelowFloor,
  floorPercentText,
} from "../../src/lib/confidence-floor.js";

describe("confidence floor", () => {
  it("is 0.3", () => {
    assert.equal(COVERAGE_CONFIDENCE_FLOOR, 0.3);
  });

  it("isBelowFloor is exclusive at the floor", () => {
    assert.equal(isBelowFloor(0.29), true);
    assert.equal(isBelowFloor(0.3), false);
    assert.equal(isBelowFloor(0.31), false);
  });

  it("formats the floor for display", () => {
    assert.equal(floorPercentText(), "30%");
  });
});
