import { test, describe } from "node:test";
import assert from "node:assert";
import { createOauthService } from "../index.js";

function stubProvider() {
  return {
    Begin: async () => ({
      upstream_authorize_url: "https://github.com/login/oauth/authorize",
      state: "s1",
    }),
    Complete: async () => ({}),
    Redeem: async () => ({
      access_token: "tok",
      token_type: "bearer",
      expires_in: 3600,
    }),
  };
}

function createTestService(overrides = {}) {
  return createOauthService({
    config: {
      issuer: "http://localhost:3007",
      host: "0.0.0.0",
      port: 0,
      provider: "ghauth",
      ...overrides,
    },
    logger: { info: () => {}, error: () => {} },
    providerClient: stubProvider(),
  });
}

describe("oauth metadata (SC#2)", () => {
  test("serves valid AS metadata document", async () => {
    const { app } = createTestService();
    const res = await app.request("/.well-known/oauth-authorization-server");

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.issuer, "http://localhost:3007");
    assert.strictEqual(
      body.authorization_endpoint,
      "http://localhost:3007/authorize",
    );
    assert.strictEqual(body.token_endpoint, "http://localhost:3007/token");
    assert.ok(body.response_types_supported.includes("code"));
    assert.ok(body.grant_types_supported.includes("authorization_code"));
    assert.ok(body.code_challenge_methods_supported.includes("S256"));
  });

  test("metadata includes security headers", async () => {
    const { app } = createTestService();
    const res = await app.request("/.well-known/oauth-authorization-server");

    assert.strictEqual(res.headers.get("X-Content-Type-Options"), "nosniff");
    assert.strictEqual(res.headers.get("X-Frame-Options"), "DENY");
    assert.strictEqual(res.headers.get("Cache-Control"), "no-store");
  });
});
