import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockConfig } from "@forwardimpact/libmock";
import { createMockStorage } from "@forwardimpact/libmock/mock";
import { GhauthService } from "../index.js";
import { BindingStore, FlowStore, GrantStore } from "../src/stores.js";

describe("ghauth smoke (SC#1)", () => {
  test("service constructs and GetToken returns a response object", async () => {
    const storage = createMockStorage();
    const config = createMockConfig("ghauth", {
      link_base_url: "http://localhost:3007",
    });
    const service = new GhauthService(config, {
      bindings: new BindingStore(storage),
      flows: new FlowStore(storage),
      grants: new GrantStore(storage),
      github: {
        authorizeUrl: () => "http://gh",
        exchangeCode: async () => ({}),
        refresh: async () => ({}),
        revoke: async () => {},
      },
    });

    const result = await service.GetToken({
      surface: "teams",
      surface_user_id: "u1",
    });
    assert.ok(result, "GetToken returns a response");
    assert.strictEqual(typeof result, "object");
  });
});
