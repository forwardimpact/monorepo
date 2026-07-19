import { test } from "node:test";
import assert from "node:assert/strict";

import { store, sample } from "./feature-helpers.js";

test("filterTodos is case-insensitive", () => {
  assert.equal(store.filterTodos(sample, "DOG").length, 1);
  assert.equal(store.filterTodos(sample, "dog")[0].text, "Walk the dog");
});
