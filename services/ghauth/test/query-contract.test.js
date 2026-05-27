import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockConfig } from "@forwardimpact/libharness";
import { createMockStorage } from "@forwardimpact/libharness/mock";
import { GhauthService } from "../index.js";
import { BindingStore, FlowStore, GrantStore } from "../src/stores.js";

describe("ghauth query-contract (SC#8)", () => {
  test("GetToken accepts (surface, surface_user_id) and token arm is typeof string", async () => {
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
      id: BindingStore.keyOf("github-discussions", "ext-42"),
      github_user_id: "ghuser-xyz",
      access_token: "ghu_contract_token",
      refresh_token: null,
      expires_at: null,
      scopes: [],
    });

    const result = await service.GetToken({
      surface: "github-discussions",
      surface_user_id: "ext-42",
    });

    assert.strictEqual(typeof result.token, "string", "token arm is a string");
    assert.strictEqual(result.token, "ghu_contract_token");
  });
});
