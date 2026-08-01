import { test } from "node:test";
import assert from "node:assert/strict";

import { store, sample } from "./feature-helpers.js";

test("filterTodos returns nothing when nothing matches", () => {
  assert.deepEqual(store.filterTodos(sample, "zzz"), []);
});
