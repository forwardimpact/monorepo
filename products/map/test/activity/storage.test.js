import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import {
  storeRaw,
  readRaw,
  listRaw,
} from "@forwardimpact/map/activity/storage";

function createFakeClient() {
  const files = new Map();
  return {
    files,
    storage: {
      from(bucket) {
        assert.strictEqual(bucket, "raw");
        return {
          async upload(path, content) {
            files.set(path, {
              content,
              created_at: new Date().toISOString(),
            });
            return { error: null };
          },
          async download(path) {
            const entry = files.get(path);
            if (!entry) return { data: null, error: { message: "not found" } };
            return { data: { text: async () => entry.content }, error: null };
          },
          async list(prefix) {
            const data = [...files.entries()]
              .filter(([p]) => p.startsWith(prefix))
              .map(([p, v]) => ({
                name: p.slice(prefix.length),
                created_at: v.created_at,
              }));
            return { data, error: null };
          },
        };
      },
    },
  };
}

describe("activity/storage", () => {
  let fake;
  beforeEach(() => {
    fake = createFakeClient();
  });

  test("storeRaw then readRaw round-trips content", async () => {
    const r = await storeRaw(fake, "people/test.yaml", "hello");
    assert.strictEqual(r.stored, true);
    assert.strictEqual(r.path, "people/test.yaml");
    const text = await readRaw(fake, "people/test.yaml");
    assert.strictEqual(text, "hello");
  });

  test("listRaw returns files under a prefix", async () => {
    await storeRaw(fake, "people/one.yaml", "1");
    await storeRaw(fake, "people/two.yaml", "2");
    await storeRaw(fake, "github/one.json", "x");
    const people = await listRaw(fake, "people/");
    assert.strictEqual(people.length, 2);
    const github = await listRaw(fake, "github/");
    assert.strictEqual(github.length, 1);
  });

  test("readRaw throws on missing file", async () => {
    await assert.rejects(() => readRaw(fake, "nope"), /not found/);
  });

  test("storeRaw returns error when upload fails", async () => {
    const badClient = {
      storage: {
        from() {
          return {
            async upload() {
              return { error: { message: "quota exceeded" } };
            },
          };
        },
      },
    };
    const r = await storeRaw(badClient, "p", "c");
    assert.strictEqual(r.stored, false);
    assert.match(r.error, /quota exceeded/);
  });
});
