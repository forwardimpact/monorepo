import { test, describe } from "node:test";
import assert from "node:assert";
import { createOauthService } from "../index.js";

describe("oauth authorize (SC#2)", () => {
  test("authorize endpoint redirects to upstream_authorize_url", async () => {
    const upstreamUrl =
      "https://github.com/login/oauth/authorize?client_id=cid&state=s1";
    const { app } = createOauthService({
      config: {
        issuer: "http://localhost:3007",
        host: "0.0.0.0",
        port: 0,
        provider: "ghauth",
      },
      logger: { info: () => {}, error: () => {} },
      providerClient: {
        Begin: async (req) => {
          assert.strictEqual(req.surface, "teams");
          assert.strictEqual(req.surface_user_id, "u1");
          return { upstream_authorize_url: upstreamUrl, state: "s1" };
        },
        Complete: async () => ({}),
        Redeem: async () => ({}),
      },
    });

    const res = await app.request(
      "/authorize?surface=teams&surface_user_id=u1",
    );
    assert.strictEqual(res.status, 302);
    assert.strictEqual(res.headers.get("Location"), upstreamUrl);
  });

  test("callback with redirect_uri redirects to client with downstream_code", async () => {
    const { app } = createOauthService({
      config: {
        issuer: "http://localhost:3007",
        host: "0.0.0.0",
        port: 0,
        provider: "ghauth",
      },
      logger: { info: () => {}, error: () => {} },
      providerClient: {
        Begin: async () => ({}),
        Complete: async () => ({
          downstream_code: "dc-123",
          redirect_uri: "http://client.example/cb",
          client_state: "cs-1",
        }),
        Redeem: async () => ({}),
      },
    });

    const res = await app.request("/callback?code=gh-code&state=s1");
    assert.strictEqual(res.status, 302);
    const location = new URL(res.headers.get("Location"));
    assert.strictEqual(
      location.origin + location.pathname,
      "http://client.example/cb",
    );
    assert.strictEqual(location.searchParams.get("code"), "dc-123");
    assert.strictEqual(location.searchParams.get("state"), "cs-1");
  });

  test("callback without redirect_uri renders linked page", async () => {
    const { app } = createOauthService({
      config: {
        issuer: "http://localhost:3007",
        host: "0.0.0.0",
        port: 0,
        provider: "ghauth",
      },
      logger: { info: () => {}, error: () => {} },
      providerClient: {
        Begin: async () => ({}),
        Complete: async () => ({}),
        Redeem: async () => ({}),
      },
    });

    const res = await app.request("/callback?code=gh-code&state=s1");
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("Linked"), "page contains Linked heading");
  });

  test("/authorize with client_state passes it to Begin", async () => {
    let capturedClientState;
    const { app } = createOauthService({
      config: {
        issuer: "http://localhost:3007",
        host: "0.0.0.0",
        port: 0,
        provider: "ghauth",
      },
      logger: { info: () => {}, error: () => {} },
      providerClient: {
        Begin: async (req) => {
          capturedClientState = req.client_state;
          return { upstream_authorize_url: "http://gh", state: "s1" };
        },
        Complete: async () => ({}),
        Redeem: async () => ({}),
      },
    });

    await app.request(
      "/authorize?surface=teams&surface_user_id=u1&client_state=link-tok-99",
    );
    assert.strictEqual(capturedClientState, "link-tok-99");
  });

  test("/callback with identity_mismatch renders refusal page", async () => {
    const { app } = createOauthService({
      config: {
        issuer: "http://localhost:3007",
        host: "0.0.0.0",
        port: 0,
        provider: "ghauth",
      },
      logger: { info: () => {}, error: () => {} },
      providerClient: {
        Begin: async () => ({}),
        Complete: async () => ({ outcome: "identity_mismatch" }),
        Redeem: async () => ({}),
      },
    });

    const res = await app.request("/callback?code=gh-code&state=s1");
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("mismatch"), "page contains mismatch text");
  });

  test("health endpoint returns ok", async () => {
    const { app } = createOauthService({
      config: {
        issuer: "http://localhost:3007",
        host: "0.0.0.0",
        port: 0,
        provider: "ghauth",
      },
      logger: { info: () => {}, error: () => {} },
      providerClient: {
        Begin: async () => ({}),
        Complete: async () => ({}),
        Redeem: async () => ({}),
      },
    });

    const res = await app.request("/health");
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, "ok");
  });
});
