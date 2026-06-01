import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockConfig, createMockClock } from "@forwardimpact/libmock";
import { createMockStorage } from "@forwardimpact/libmock/mock";
import { GhuserService } from "../index.js";
import { BindingStore, FlowStore, GrantStore } from "../src/stores.js";
import { RevokedError } from "../src/github-oauth.js";

describe("ghuser query-reauth (SC#6)", () => {
  test("expired token with revoked refresh returns re_auth_required", async () => {
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
        refresh: async () => {
          throw new RevokedError();
        },
        revoke: async () => {},
      },
    });

    await bindings.upsert({
      id: BindingStore.keyOf("teams", "u1"),
      github_user_id: "ghuser-abc",
      access_token: "ghu_expired",
      refresh_token: "ghr_revoked",
      expires_at: Date.now() - 1000,
      scopes: [],
    });

    const result = await service.GetToken({
      surface: "teams",
      surface_user_id: "u1",
    });

    assert.ok(result.re_auth_required, "result contains re_auth_required");
    assert.strictEqual(result.token, undefined, "no token returned");
    assert.strictEqual(result.link_required, undefined, "not link_required");
  });

  test("expired token with no refresh_token returns re_auth_required", async () => {
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
      id: BindingStore.keyOf("teams", "u2"),
      github_user_id: "ghuser-def",
      access_token: "ghu_expired_no_refresh",
      refresh_token: null,
      expires_at: Date.now() - 1000,
      scopes: [],
    });

    const result = await service.GetToken({
      surface: "teams",
      surface_user_id: "u2",
    });

    assert.ok(result.re_auth_required, "result contains re_auth_required");
  });

  test("transient refresh error propagates as error, not re_auth_required", async () => {
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
        refresh: async () => {
          throw new Error("network timeout");
        },
        revoke: async () => {},
      },
    });

    await bindings.upsert({
      id: BindingStore.keyOf("teams", "u3"),
      github_user_id: "ghuser-ghi",
      access_token: "ghu_expired",
      refresh_token: "ghr_valid",
      expires_at: Date.now() - 1000,
      scopes: [],
    });

    await assert.rejects(
      () => service.GetToken({ surface: "teams", surface_user_id: "u3" }),
      { message: "network timeout" },
    );
  });
});
