import { test } from "node:test";
import assert from "node:assert/strict";

import { store, sample } from "./feature-helpers.js";

test("filterTodos returns nothing when no match", () => {
  assert.deepEqual(store.filterTodos(sample, "zzz"), []);
});
