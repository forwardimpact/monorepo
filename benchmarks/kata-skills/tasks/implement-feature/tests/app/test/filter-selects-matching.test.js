import { test } from "node:test";
import assert from "node:assert/strict";

import { store, sample } from "./feature-helpers.js";

test("filterTodos selects matching todos", () => {
  assert.equal(store.filterTodos(sample, "buy").length, 2);
});
