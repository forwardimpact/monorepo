import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockConfig, createMockClock } from "@forwardimpact/libmock";
import { createMockStorage } from "@forwardimpact/libmock/mock";
import { GhuserService } from "../index.js";
import { BindingStore, FlowStore, GrantStore } from "../src/stores.js";

describe("ghuser smoke (SC#1)", () => {
  test("service constructs and GetToken returns a response object", async () => {
    const storage = createMockStorage();
    const config = createMockConfig("ghuser", {
      link_base_url: "http://localhost:3007",
    });
    const clock = createMockClock({ start: Date.now() });
    const service = new GhuserService(config, {
      bindings: new BindingStore(storage, { clock }),
      flows: new FlowStore(storage, { clock }),
      grants: new GrantStore(storage, { clock }),
      clock,
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
