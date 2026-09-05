import { test } from "node:test";
import assert from "node:assert/strict";

import { isTruthy } from "../src/truthy.js";

test("isTruthy reads the five falsy strings as not engaged", () => {
  for (const value of ["", "0", "false", "no", "off"]) {
    assert.equal(isTruthy(value), false, value);
    assert.equal(isTruthy(value.toUpperCase()), false, value.toUpperCase());
    assert.equal(isTruthy(` ${value} `), false, `padded ${value}`);
  }
});

test("isTruthy reads an absent value as not engaged", () => {
  assert.equal(isTruthy(null), false);
  assert.equal(isTruthy(undefined), false);
});

test("isTruthy reads every other value as engaged", () => {
  assert.equal(isTruthy("1"), true);
  assert.equal(isTruthy("true"), true);
  assert.equal(
    isTruthy("watchdog|issues=47/32|2026-09-02T16:49:00.000Z"),
    true,
  );
});
