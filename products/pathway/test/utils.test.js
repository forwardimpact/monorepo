import { test, describe } from "node:test";
import assert from "node:assert";

import { getItemsByIds } from "../src/lib/utils.js";

describe("getItemsByIds", () => {
  const items = [
    { id: "a", name: "Alpha" },
    { id: "b", name: "Beta" },
    { id: "c", name: "Charlie" },
  ];

  test("returns matching items in order of IDs", () => {
    const result = getItemsByIds(items, ["c", "a"]);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].id, "c");
    assert.strictEqual(result[1].id, "a");
  });

  test("filters out non-existent IDs", () => {
    const result = getItemsByIds(items, ["a", "unknown"]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, "a");
  });

  test("returns empty array for null IDs", () => {
    assert.deepStrictEqual(getItemsByIds(items, null), []);
  });

  test("returns empty array for undefined IDs", () => {
    assert.deepStrictEqual(getItemsByIds(items, undefined), []);
  });

  test("returns empty array when no IDs match", () => {
    assert.deepStrictEqual(getItemsByIds(items, ["x", "y"]), []);
  });
});
