import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockStorage } from "@forwardimpact/libmock/mock";
import { BindingStore } from "../src/stores.js";

describe("ghauth persistence (SC#7)", () => {
  test("binding written before restart is readable after fresh start", async () => {
    const storage = createMockStorage();

    const store1 = new BindingStore(storage);
    await store1.upsert({
      id: BindingStore.keyOf("teams", "u1"),
      github_user_id: "ghuser-abc",
      access_token: "ghu_persisted",
      refresh_token: "ghr_persisted",
      expires_at: Date.now() + 3600_000,
      scopes: ["repo"],
    });
    await store1.shutdown();

    const store2 = new BindingStore(storage);
    const binding = await store2.loadBinding("teams", "u1");
    assert.ok(binding, "binding survives restart");
    assert.strictEqual(binding.access_token, "ghu_persisted");
    await store2.shutdown();
  });

  test("deleted binding is not readable after restart", async () => {
    const storage = createMockStorage();

    const store1 = new BindingStore(storage);
    const id = BindingStore.keyOf("teams", "u2");
    await store1.upsert({
      id,
      github_user_id: "ghuser-def",
      access_token: "ghu_to_delete",
      refresh_token: null,
      expires_at: null,
      scopes: [],
    });
    await store1.delete(id);
    await store1.shutdown();

    const store2 = new BindingStore(storage);
    const binding = await store2.loadBinding("teams", "u2");
    assert.strictEqual(
      binding,
      null,
      "deleted binding does not survive restart",
    );
    await store2.shutdown();
  });
});
