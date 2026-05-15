import { test, describe } from "node:test";
import assert from "node:assert";

import { createConfig } from "../src/index.js";
import { createMockStorage, spy } from "@forwardimpact/libharness";

describe("libconfig - Config getters", () => {
  const mockStorageFn = () =>
    createMockStorage({
      get: spy(() => Promise.resolve("")),
    });

  test("init returns init config from file data", async () => {
    const mockStorage = createMockStorage({
      get: spy(() =>
        Promise.resolve({
          init: {
            log_dir: "data/logs",
            shutdown_timeout: 5000,
            services: [{ name: "api", command: "bun start" }],
          },
        }),
      ),
    });

    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: {},
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      mockProcess,
      () => mockStorage,
    );

    assert.ok(config.init);
    assert.strictEqual(config.init.log_dir, "data/logs");
    assert.strictEqual(config.init.shutdown_timeout, 5000);
  });

  test("init returns null when not present in file", async () => {
    const mockStorage = createMockStorage({
      get: spy(() => Promise.resolve({})),
    });

    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: {},
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      mockProcess,
      () => mockStorage,
    );

    assert.strictEqual(config.init, null);
  });

  test("rootDir returns parent of config directory", async () => {
    const mockStorage = createMockStorage({
      get: spy(() => Promise.resolve({})),
      path: spy(() => "/project/root/config"),
    });

    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: {},
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      mockProcess,
      () => mockStorage,
    );

    assert.strictEqual(config.rootDir, "/project/root");
  });

  test("ghToken throws when not set in environment and gh cli fails", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: {},
    };
    const mockExecSync = spy(() => {
      throw new Error("gh: command not found");
    });

    const config = await createConfig(
      "test",
      "myservice",
      {},
      mockProcess,
      mockStorageFn,
      mockExecSync,
    );
    assert.throws(() => config.ghToken(), /GH_TOKEN not found in environment/);
  });

  test("ghToken returns from environment", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: { GH_TOKEN: "gh-cli-token" },
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      mockProcess,
      mockStorageFn,
    );
    assert.strictEqual(config.ghToken(), "gh-cli-token");
  });

  test("ghToken falls back to GITHUB_TOKEN when GH_TOKEN is unset", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: { GITHUB_TOKEN: "actions-token" },
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      mockProcess,
      mockStorageFn,
    );
    assert.strictEqual(config.ghToken(), "actions-token");
  });

  test("ghToken prefers GH_TOKEN when both are set", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: { GITHUB_TOKEN: "github-token", GH_TOKEN: "gh-token" },
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      mockProcess,
      mockStorageFn,
    );
    assert.strictEqual(config.ghToken(), "gh-token");
  });

  test("ghToken falls back to gh auth token when env vars are unset", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: {},
    };
    const mockExecSync = spy(() => "fake-gh-cli-token\n");

    const config = await createConfig(
      "test",
      "myservice",
      {},
      mockProcess,
      mockStorageFn,
      mockExecSync,
    );
    assert.strictEqual(config.ghToken(), "fake-gh-cli-token");
    assert.strictEqual(mockExecSync.mock.callCount(), 1);
    assert.strictEqual(
      mockExecSync.mock.calls[0].arguments[0],
      "gh auth token",
    );
  });

  test("ghToken caches gh auth token result", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: {},
    };
    const mockExecSync = spy(() => "fake-gh-cli-token");

    const config = await createConfig(
      "test",
      "myservice",
      {},
      mockProcess,
      mockStorageFn,
      mockExecSync,
    );
    const first = config.ghToken();
    const second = config.ghToken();
    assert.strictEqual(first, second);
    assert.strictEqual(mockExecSync.mock.callCount(), 1);
  });

  test("embeddingBaseUrl returns custom URL from environment", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: { EMBEDDING_BASE_URL: "https://custom.api.com" },
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      mockProcess,
      mockStorageFn,
    );
    assert.strictEqual(config.embeddingBaseUrl(), "https://custom.api.com");
  });

  test("supabaseUrl() returns env value with trailing slashes stripped", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: { SUPABASE_URL: "http://127.0.0.1:54321/" },
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      mockProcess,
      mockStorageFn,
    );
    assert.strictEqual(config.supabaseUrl(), "http://127.0.0.1:54321");
  });

  test("supabaseUrl() throws when unset", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: {},
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      mockProcess,
      mockStorageFn,
    );
    assert.throws(() => config.supabaseUrl(), {
      message: "SUPABASE_URL not found in environment",
    });
  });

  test("supabaseAnonKey() returns env value", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: { SUPABASE_ANON_KEY: "anon-key-value" },
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      mockProcess,
      mockStorageFn,
    );
    assert.strictEqual(config.supabaseAnonKey(), "anon-key-value");
  });

  test("supabaseAnonKey() throws when unset", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: {},
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      mockProcess,
      mockStorageFn,
    );
    assert.throws(() => config.supabaseAnonKey(), {
      message: "SUPABASE_ANON_KEY not found in environment",
    });
  });

  test("supabaseServiceRoleKey() returns env value", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: { SUPABASE_SERVICE_ROLE_KEY: "service-role-key-value" },
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      mockProcess,
      mockStorageFn,
    );
    assert.strictEqual(
      config.supabaseServiceRoleKey(),
      "service-role-key-value",
    );
  });

  test("supabaseServiceRoleKey() throws when unset", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: {},
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      mockProcess,
      mockStorageFn,
    );
    assert.throws(() => config.supabaseServiceRoleKey(), {
      message: "SUPABASE_SERVICE_ROLE_KEY not found in environment",
    });
  });

  test("supabaseJwtSecret() returns env value", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: { SUPABASE_JWT_SECRET: "jwt-secret-value" },
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      mockProcess,
      mockStorageFn,
    );
    assert.strictEqual(config.supabaseJwtSecret(), "jwt-secret-value");
  });

  test("supabaseJwtSecret() throws when unset", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: {},
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      mockProcess,
      mockStorageFn,
    );
    assert.throws(() => config.supabaseJwtSecret(), {
      message: "SUPABASE_JWT_SECRET not found in environment",
    });
  });
});
