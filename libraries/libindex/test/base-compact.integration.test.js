import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import * as fsp from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { IndexBase } from "../src/index.js";
import { LocalStorage } from "@forwardimpact/libstorage";

class TestIndex extends IndexBase {
  constructor(storage, indexKey = "test.jsonl") {
    super(storage, indexKey);
  }

  async addRecord(id, payload) {
    await super.add({ id, ...payload });
  }
}

describe("IndexBase compact() — real-storage round-trip", () => {
  let tmpDir;
  let storage;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "libindex-compact-"));
    storage = new LocalStorage(tmpDir, fsp);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("after compact, a fresh instance over the same path observes only the live records", async () => {
    const idx = new TestIndex(storage);
    await idx.addRecord("a", { body: "alpha" });
    await idx.addRecord("b", { body: "beta" });
    await idx.addRecord("c", { body: "gamma" });

    idx.index.delete("b");
    await idx.compact();

    const reopened = new TestIndex(storage);
    await reopened.loadData();

    assert.strictEqual(await reopened.has("a"), true);
    assert.strictEqual(await reopened.has("b"), false);
    assert.strictEqual(await reopened.has("c"), true);

    const onDisk = await fsp.readFile(join(tmpDir, "test.jsonl"), "utf8");
    assert.strictEqual(
      onDisk.includes("beta"),
      false,
      "the deleted record's literal body string must not remain on disk",
    );
  });
});
