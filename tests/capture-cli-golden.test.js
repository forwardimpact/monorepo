import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { applyTransforms } from "../scripts/capture-cli-golden.mjs";

describe("applyTransforms", () => {
  test("normalises matches with the g flag", () => {
    const out = applyTransforms("ts=RUNAAA ts=RUNBBB", [
      { pattern: "RUN[A-Z]+", replacement: "STAMP" },
    ]);
    assert.equal(out, "ts=STAMP ts=STAMP");
  });
});
