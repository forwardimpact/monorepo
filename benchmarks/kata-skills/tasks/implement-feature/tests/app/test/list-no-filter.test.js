import { test } from "node:test";
import assert from "node:assert/strict";

import { runList, sample } from "./feature-helpers.js";

test("list with no filter prints everything", () => {
  const out = runList([], sample);
  assert.equal(out.split("\n").filter(Boolean).length, 3);
});
