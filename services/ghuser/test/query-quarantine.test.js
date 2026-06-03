import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockConfig, createMockClock } from "@forwardimpact/libmock";
import { createMockStorage } from "@forwardimpact/libmock/mock";
import { GhuserService } from "../index.js";
import { BindingStore, FlowStore, GrantStore } from "../src/stores.js";

describe("ghuser query-quarantine (#1397)", () => {
  test("GetToken returns link_required for non-allowed surface even when binding exists", async () => {
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

    // A binding from the pre-fix contract: indistinguishable from an
    // attacker-planted one, so the quarantine must refuse to dispatch.
    await bindings.upsert({
      id: BindingStore.keyOf("msteams", "victim-aad-obj-id"),
      github_user_id: "attacker-ghuser-id",
      access_token: "ghu_planted_token",
      refresh_token: null,
      expires_at: null,
      scopes: [],
    });

    const result = await service.GetToken({
      surface: "msteams",
      surface_user_id: "victim-aad-obj-id",
    });

    assert.strictEqual(result.token, undefined, "no token returned");
    assert.ok(result.link_required, "result is link_required");
    assert.ok(
      result.link_required.authorize_url.includes("surface=msteams"),
      "URL carries surface param",
    );

    // Record remains in storage — spec 1520 migration is the canonical
    // invalidation point.
    const stored = await bindings.loadBinding("msteams", "victim-aad-obj-id");
    assert.ok(stored, "binding record remains in storage");
    assert.strictEqual(stored.access_token, "ghu_planted_token");
  });
});
