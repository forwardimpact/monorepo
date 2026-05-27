import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockConfig } from "@forwardimpact/libmock";
import { createMockStorage } from "@forwardimpact/libmock/mock";
import { GhauthService } from "../index.js";
import { BindingStore, FlowStore, GrantStore } from "../src/stores.js";

describe("ghauth query-linked (SC#4)", () => {
  test("linked user with valid token returns that token unchanged", async () => {
    const storage = createMockStorage();
    const config = createMockConfig("ghauth", {
      link_base_url: "http://localhost:3007",
    });
    const bindings = new BindingStore(storage);
    const service = new GhauthService(config, {
      bindings,
      flows: new FlowStore(storage),
      grants: new GrantStore(storage),
      github: {
        authorizeUrl: () => "",
        exchangeCode: async () => ({}),
        refresh: async () => ({}),
        revoke: async () => {},
      },
    });

    await bindings.upsert({
      id: BindingStore.keyOf("teams", "u1"),
      github_user_id: "ghuser-abc",
      access_token: "ghu_stored_token",
      refresh_token: "ghr_refresh",
      expires_at: Date.now() + 3600_000,
      scopes: ["repo"],
    });

    const result = await service.GetToken({
      surface: "teams",
      surface_user_id: "u1",
    });
    assert.strictEqual(result.token, "ghu_stored_token");
  });

  test("linked user with non-expiring token returns it", async () => {
    const storage = createMockStorage();
    const config = createMockConfig("ghauth", {
      link_base_url: "http://localhost:3007",
    });
    const bindings = new BindingStore(storage);
    const service = new GhauthService(config, {
      bindings,
      flows: new FlowStore(storage),
      grants: new GrantStore(storage),
      github: {
        authorizeUrl: () => "",
        exchangeCode: async () => ({}),
        refresh: async () => ({}),
        revoke: async () => {},
      },
    });

    await bindings.upsert({
      id: BindingStore.keyOf("teams", "u2"),
      github_user_id: "ghuser-def",
      access_token: "ghu_no_expiry",
      refresh_token: null,
      expires_at: null,
      scopes: [],
    });

    const result = await service.GetToken({
      surface: "teams",
      surface_user_id: "u2",
    });
    assert.strictEqual(result.token, "ghu_no_expiry");
  });
});
