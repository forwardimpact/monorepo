import { test, describe } from "node:test";
import assert from "node:assert";

import { createConfig } from "../src/index.js";
import { createMockStorage, spy } from "@forwardimpact/libmock";

describe("libconfig - Anthropic and MCP credentials", () => {
  const baseMockProcess = () => ({
    cwd: spy(() => "/test/dir"),
    env: {},
  });

  /**
   * Wraps a mock storage so put() stringifies .json values, matching
   * real LocalStorage behaviour (get already JSON.parses them).
   */
  const mockStorageFn = (storage) => () => {
    const originalPut = storage.put.bind(storage);
    storage.put = spy((key, value) => {
      const toStore =
        key.endsWith(".json") && typeof value !== "string"
          ? JSON.stringify(value)
          : value;
      return originalPut(key, toStore);
    });
    return storage;
  };

  test("mcpToken() returns value from environment", async () => {
    const storage = createMockStorage({
      get: spy(() => Promise.resolve("")),
    });
    const proc = baseMockProcess();
    proc.env.MCP_TOKEN = "mcp-secret-123";

    const config = await createConfig(
      "test",
      "myservice",
      {},
      proc,
      mockStorageFn(storage),
    );
    assert.strictEqual(config.mcpToken(), "mcp-secret-123");
  });

  test("mcpToken() throws when absent", async () => {
    const storage = createMockStorage({
      get: spy(() => Promise.resolve("")),
    });
    const config = await createConfig(
      "test",
      "myservice",
      {},
      baseMockProcess(),
      mockStorageFn(storage),
    );
    assert.throws(() => config.mcpToken(), {
      message: "MCP_TOKEN not found in environment",
    });
  });

  test("anthropicToken() prefers env var over OAuth", async () => {
    const storage = createMockStorage({
      get: spy(() => Promise.resolve("")),
    });
    const proc = baseMockProcess();
    proc.env.ANTHROPIC_API_KEY = "sk-ant-env-key";

    // Also seed an OAuth file — env var should still win
    storage.data.set(
      "anthropic-oauth.json",
      JSON.stringify({
        access_token: "oauth-token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
      }),
    );

    const config = await createConfig(
      "test",
      "myservice",
      {},
      proc,
      mockStorageFn(storage),
    );
    const token = await config.anthropicToken();
    assert.strictEqual(token, "sk-ant-env-key");
  });

  test("anthropicToken() falls back to OAuth file", async () => {
    const storage = createMockStorage();
    storage.data.set(
      "anthropic-oauth.json",
      JSON.stringify({
        access_token: "oauth-access-token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
      }),
    );

    const config = await createConfig(
      "test",
      "myservice",
      {},
      baseMockProcess(),
      mockStorageFn(storage),
    );
    const token = await config.anthropicToken();
    assert.strictEqual(token, "oauth-access-token");
  });

  test("anthropicToken() refreshes expired token", async () => {
    const storage = createMockStorage();
    storage.data.set(
      "anthropic-oauth.json",
      JSON.stringify({
        access_token: "old-token",
        refresh_token: "my-refresh-token",
        expires_at: Date.now() - 1000, // expired
      }),
    );

    const proc = baseMockProcess();
    proc.env.ANTHROPIC_OAUTH_TOKEN_URL = "http://mock-auth/oauth/token";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = spy(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "refreshed-token",
            refresh_token: "new-refresh",
            expires_in: 3600,
          }),
      }),
    );

    try {
      const config = await createConfig(
        "test",
        "myservice",
        {},
        proc,
        mockStorageFn(storage),
      );
      const token = await config.anthropicToken();

      assert.strictEqual(token, "refreshed-token");
      // Verify the token was persisted
      const stored = JSON.parse(storage.data.get("anthropic-oauth.json"));
      assert.strictEqual(stored.access_token, "refreshed-token");
      assert.strictEqual(stored.refresh_token, "new-refresh");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("anthropicToken() clears token and throws on failed refresh", async () => {
    const storage = createMockStorage();
    storage.data.set(
      "anthropic-oauth.json",
      JSON.stringify({
        access_token: "old-token",
        refresh_token: "bad-refresh",
        expires_at: Date.now() - 1000,
      }),
    );

    const proc = baseMockProcess();
    proc.env.ANTHROPIC_OAUTH_TOKEN_URL = "http://mock-auth/oauth/token";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = spy(() => Promise.resolve({ ok: false, status: 401 }));

    try {
      const config = await createConfig(
        "test",
        "myservice",
        {},
        proc,
        mockStorageFn(storage),
      );
      await assert.rejects(() => config.anthropicToken(), {
        message: "Session expired. Run `fit-guide login` to re-authenticate.",
      });
      // Verify the stale token was cleared
      assert.strictEqual(storage.data.has("anthropic-oauth.json"), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("anthropicToken() throws when neither source exists", async () => {
    const storage = createMockStorage();
    const config = await createConfig(
      "test",
      "myservice",
      {},
      baseMockProcess(),
      mockStorageFn(storage),
    );
    await assert.rejects(() => config.anthropicToken(), {
      message:
        "Not authenticated. Run `fit-guide login` or set ANTHROPIC_API_KEY.",
    });
  });

  test("writeOAuthCredential() persists token", async () => {
    const storage = createMockStorage({
      get: spy(() => Promise.resolve("")),
    });
    const config = await createConfig(
      "test",
      "myservice",
      {},
      baseMockProcess(),
      mockStorageFn(storage),
    );

    const tokenData = {
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_at: Date.now() + 3600000,
    };
    await config.writeOAuthCredential(tokenData);

    assert.ok(storage.data.has("anthropic-oauth.json"));
    assert.deepStrictEqual(
      JSON.parse(storage.data.get("anthropic-oauth.json")),
      tokenData,
    );
  });

  test("clearOAuthCredential() removes file", async () => {
    const storage = createMockStorage();
    storage.data.set(
      "anthropic-oauth.json",
      JSON.stringify({ access_token: "x" }),
    );

    const config = await createConfig(
      "test",
      "myservice",
      {},
      baseMockProcess(),
      mockStorageFn(storage),
    );
    await config.clearOAuthCredential();

    assert.strictEqual(storage.data.has("anthropic-oauth.json"), false);
  });

  test("clearOAuthCredential() no-ops if absent", async () => {
    const storage = createMockStorage();
    const config = await createConfig(
      "test",
      "myservice",
      {},
      baseMockProcess(),
      mockStorageFn(storage),
    );
    // Should not throw
    await config.clearOAuthCredential();
  });
});
