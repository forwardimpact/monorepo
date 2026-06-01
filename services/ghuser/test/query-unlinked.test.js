import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockConfig, createMockClock } from "@forwardimpact/libmock";
import { createMockStorage } from "@forwardimpact/libmock/mock";
import { GhuserService } from "../index.js";
import { BindingStore, FlowStore, GrantStore } from "../src/stores.js";

describe("ghuser query-unlinked (SC#5)", () => {
  test("unlinked user returns link_required with authorize_url", async () => {
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
        authorizeUrl: () => "",
        exchangeCode: async () => ({}),
        refresh: async () => ({}),
        revoke: async () => {},
      },
    });

    const result = await service.GetToken({
      surface: "teams",
      surface_user_id: "unknown",
    });

    assert.ok(result.link_required, "result contains link_required");
    assert.ok(
      result.link_required.authorize_url,
      "link_required has authorize_url",
    );
    assert.ok(
      result.link_required.authorize_url.includes("/authorize"),
      "URL contains /authorize path",
    );
    assert.ok(
      result.link_required.authorize_url.includes("surface=teams"),
      "URL carries surface param",
    );
    assert.ok(
      result.link_required.authorize_url.includes("surface_user_id=unknown"),
      "URL carries surface_user_id param",
    );
    assert.strictEqual(result.token, undefined, "no token returned");
  });
});
