import { afterEach, describe, expect, test } from "bun:test";
import { createMockStorage } from "@forwardimpact/libmock/mock";

import { OriginIndex } from "../src/origin-index.js";

describe("OriginIndex", () => {
  let index;

  afterEach(async () => {
    if (index) {
      await index.shutdown();
      index = null;
    }
  });

  test("add then has returns true for known ids", async () => {
    index = new OriginIndex(createMockStorage());
    await index.add({ id: "C_1", discussion_id: "D_kw1", posted_at: 1000 });

    expect(await index.has("C_1")).toBe(true);
    expect(await index.has("C_unknown")).toBe(false);
  });

  test("sweep evicts records older than ttlMs", async () => {
    index = new OriginIndex(createMockStorage(), { ttlMs: 100 });
    await index.add({ id: "C_old", discussion_id: "D_1", posted_at: 100 });
    await index.add({ id: "C_new", discussion_id: "D_1", posted_at: 300 });

    const evicted = index.sweep(250);

    expect(evicted).toBe(1);
    expect(await index.has("C_old")).toBe(false);
    expect(await index.has("C_new")).toBe(true);
  });

  test("flush persists buffered entries", async () => {
    const storage = createMockStorage();
    index = new OriginIndex(storage);
    await index.add({ id: "C_1", discussion_id: "D_1", posted_at: 1 });
    await index.add({ id: "C_2", discussion_id: "D_1", posted_at: 2 });

    const count = await index.flush();

    expect(count).toBe(2);
  });
});
