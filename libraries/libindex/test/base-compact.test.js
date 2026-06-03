import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { IndexBase } from "../src/index.js";
import { createMockStorage } from "@forwardimpact/libmock";

class TestIndex extends IndexBase {
  constructor(storage, indexKey = "test.jsonl") {
    super(storage, indexKey);
  }

  async addRecord(id, payload) {
    await super.add({ id, ...payload });
  }
}

describe("IndexBase compact() — put-call shape (mock storage)", () => {
  let mockStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();
  });

  test("writes one record per live in-memory entry via storage.put", async () => {
    const idx = new TestIndex(mockStorage);
    await idx.addRecord("a", { body: "alpha" });
    await idx.addRecord("b", { body: "beta" });
    await idx.addRecord("c", { body: "gamma" });

    idx.index.delete("b");
    await idx.compact();

    assert.strictEqual(
      mockStorage.put.mock.callCount(),
      1,
      "compact should call put once",
    );
    const [key, value] = mockStorage.put.mock.calls[0].arguments;
    assert.strictEqual(key, "test.jsonl");
    assert.strictEqual(value.length, 2, "should persist exactly two records");
    assert.deepStrictEqual(value.map((r) => r.id).sort(), ["a", "c"]);
  });

  test("loads data first when compact runs before any other call", async () => {
    const seeded = createMockStorage();
    seeded.exists = () => Promise.resolve(true);
    seeded.get = () =>
      Promise.resolve([
        { id: "x", body: "ex" },
        { id: "y", body: "wy" },
      ]);

    const idx = new TestIndex(seeded);
    await idx.compact();

    const [key, value] = seeded.put.mock.calls.at(-1).arguments;
    assert.strictEqual(key, "test.jsonl");
    assert.deepStrictEqual(value.map((r) => r.id).sort(), ["x", "y"]);
  });
});
