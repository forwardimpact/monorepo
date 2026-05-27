import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockConfig } from "@forwardimpact/libmock";
import { createMockStorage } from "@forwardimpact/libmock/mock";
import { GhauthService } from "../index.js";
import { BindingStore, FlowStore, GrantStore } from "../src/stores.js";

describe("ghauth query-unlinked (SC#5)", () => {
  test("unlinked user returns link_required with authorize_url", async () => {
    const storage = createMockStorage();
    const config = createMockConfig("ghauth", {
      link_base_url: "http://localhost:3007",
    });
    const service = new GhauthService(config, {
      bindings: new BindingStore(storage),
      flows: new FlowStore(storage),
      grants: new GrantStore(storage),
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
