import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockConfig, createMockClock } from "@forwardimpact/libmock";
import { createMockStorage } from "@forwardimpact/libmock/mock";
import { GhuserService } from "../index.js";
import { BindingStore, FlowStore, GrantStore } from "../src/stores.js";

function createService(storage, { getUserId = "12345" } = {}) {
  const config = createMockConfig("ghuser", {
    link_base_url: "http://localhost:3007",
  });
  const clock = createMockClock({ start: Date.now() });
  const bindings = new BindingStore(storage, { clock });
  return {
    service: new GhuserService(config, {
      bindings,
      flows: new FlowStore(storage, { clock }),
      grants: new GrantStore(storage, { clock }),
      clock,
      github: {
        authorizeUrl: () => "http://gh/authorize",
        exchangeCode: async () => ({
          access_token: "ghu_test",
          refresh_token: "ghr_test",
          expires_in: 3600,
        }),
        getUser: async () => getUserId,
        refresh: async () => ({}),
        revoke: async () => {},
      },
    }),
    bindings,
  };
}

describe("ghuser identity verification", () => {
  test("matching id creates binding with github_user_id", async () => {
    const storage = createMockStorage();
    const { service, bindings } = createService(storage, {
      getUserId: "42",
    });

    const { state } = await service.Begin({
      surface: "github-discussions",
      surface_user_id: "42",
    });
    const result = await service.Complete({ code: "code1", state });

    assert.strictEqual(result.outcome, undefined);
    const binding = await bindings.loadBinding("github-discussions", "42");
    assert.ok(binding, "binding was created");
    assert.strictEqual(binding.github_user_id, "42");
  });

  test("mismatching id returns identity_mismatch and creates no binding", async () => {
    const storage = createMockStorage();
    const { service, bindings } = createService(storage, {
      getUserId: "999",
    });

    const { state } = await service.Begin({
      surface: "github-discussions",
      surface_user_id: "42",
    });
    const result = await service.Complete({ code: "code1", state });

    assert.strictEqual(result.outcome, "identity_mismatch");
    const binding = await bindings.loadBinding("github-discussions", "42");
    assert.strictEqual(binding, null, "no binding created");
  });

  test("non-github-discussions surface creates binding regardless of id difference", async () => {
    const storage = createMockStorage();
    const { service, bindings } = createService(storage, {
      getUserId: "999",
    });

    const { state } = await service.Begin({
      surface: "msteams",
      surface_user_id: "aad-obj-id",
    });
    const result = await service.Complete({ code: "code1", state });

    assert.strictEqual(result.outcome, undefined);
    const binding = await bindings.loadBinding("msteams", "aad-obj-id");
    assert.ok(binding, "binding was created");
    assert.strictEqual(binding.github_user_id, "999");
  });

  test("client_state round-trip: Begin stores it, Complete returns it", async () => {
    const storage = createMockStorage();
    const { service } = createService(storage, { getUserId: "42" });

    const { state } = await service.Begin({
      surface: "github-discussions",
      surface_user_id: "42",
      client_state: "tok-abc",
      redirect_uri: "http://bridge/api/link-complete",
    });
    const result = await service.Complete({ code: "code1", state });

    assert.strictEqual(result.client_state, "tok-abc");
  });
});
