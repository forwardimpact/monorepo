import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockConfig, createMockClock } from "@forwardimpact/libmock";
import { createMockStorage } from "@forwardimpact/libmock/mock";
import { GhuserService } from "../index.js";
import { BindingStore, FlowStore, GrantStore } from "../src/stores.js";

describe("ghuser query-contract (SC#8)", () => {
  test("GetToken accepts (surface, surface_user_id) and token arm is typeof string", async () => {
    const storage = createMockStorage();
    const config = createMockConfig("ghuser", {
      link_base_url: "http://localhost:3007",
    });
    const clock = createMockClock({ start: Date.now() });
    const bindings = new BindingStore(storage, { clock });
    const service = new GhuserService(config, {
      bindings,
      flows: new FlowStore(storage, { clock }),
      grants: new GrantStore(storage, { clock }),
      clock,
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
