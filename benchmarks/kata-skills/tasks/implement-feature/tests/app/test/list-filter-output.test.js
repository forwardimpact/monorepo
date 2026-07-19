import { test } from "node:test";
import assert from "node:assert/strict";

import { runList, sample } from "./feature-helpers.js";

test("list --filter prints only matching lines", () => {
  const out = runList(["--filter", "buy"], sample);
  assert.match(out, /Buy milk/);
  assert.match(out, /Buy stamps/);
  assert.doesNotMatch(out, /Walk the dog/);
});
