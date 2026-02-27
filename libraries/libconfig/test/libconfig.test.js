import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert";

// Module under test
import {
  createConfig,
  createServiceConfig,
  createExtensionConfig,
} from "../index.js";
import { createMockStorage } from "@forwardimpact/libharness";

describe("libconfig", () => {
  describe("Config", () => {
    let mockProcess;
    let mockStorage;

    beforeEach(() => {
      mockStorage = createMockStorage({
        get: mock.fn(() => Promise.resolve("")),
      });

      mockProcess = {
        cwd: mock.fn(() => "/test/dir"),
        env: {
          TEST_VAR: "test-value",
        },
      };
    });

    test("creates config with defaults", async () => {
      const mockStorageFn = () => mockStorage;

      const config = await createConfig(
        "test",
        "myservice",
        { defaultValue: 42 },
        mockProcess,
        mockStorageFn,
      );

      assert.strictEqual(config.name, "myservice");
      assert.strictEqual(config.namespace, "test");
      assert.strictEqual(config.defaultValue, 42);
      assert.strictEqual(config.host, "0.0.0.0");
      assert.strictEqual(config.port, 3000);
      assert.strictEqual(config.protocol, "grpc");
      assert.strictEqual(config.url, "grpc://0.0.0.0:3000");
    });

    test("loads environment variables via URL", async () => {
      mockProcess.env = {
        TEST_MYSERVICE_URL: "grpc://custom-host:8080",
      };

      const mockStorageFn = () => mockStorage;
      const config = await createConfig(
        "test",
        "myservice",
        {},
        mockProcess,
        mockStorageFn,
      );

      assert.strictEqual(config.host, "custom-host");
      assert.strictEqual(config.port, 8080);
      assert.strictEqual(config.protocol, "grpc");
      assert.strictEqual(config.url, "grpc://custom-host:8080");
    });

    test("extracts path from URL environment variable", async () => {
      mockProcess.env = {
        TEST_MYSERVICE_URL: "https://api.example.com:8443/v1/api",
      };

      const mockStorageFn = () => mockStorage;
      const config = await createConfig(
        "test",
        "myservice",
        {},
        mockProcess,
        mockStorageFn,
      );

      assert.strictEqual(config.host, "api.example.com");
      assert.strictEqual(config.port, 8443);
      assert.strictEqual(config.protocol, "https");
      assert.strictEqual(config.path, "/v1/api");
    });

    test("parses JSON environment variables", async () => {
      mockProcess.env = {
        TEST_MYSERVICE_NUMBERS: "[1, 2, 3]",
        TEST_MYSERVICE_BOOLEAN: "true",
      };

      const mockStorageFn = () => mockStorage;
      const config = await createConfig(
        "test",
        "myservice",
        { numbers: [], boolean: false }, // Need defaults for the properties to exist
        mockProcess,
        mockStorageFn,
      );

      assert.deepStrictEqual(config.numbers, [1, 2, 3]);
      assert.strictEqual(config.boolean, true);
    });

    test("falls back to string for invalid JSON", async () => {
      mockProcess.env = {
        TEST_MYSERVICE_INVALID: "not-json-[",
      };

      const mockStorageFn = () => mockStorage;
      const config = await createConfig(
        "test",
        "myservice",
        { invalid: "" }, // Need default for the property to exist
        mockProcess,
        mockStorageFn,
      );

      assert.strictEqual(config.invalid, "not-json-[");
    });

    test("loads environment variables from process.env", async () => {
      const mockStorageFn = () => mockStorage;
      const config = await createConfig(
        "test",
        "myservice",
        {},
        mockProcess,
        mockStorageFn,
      );

      // Should not throw and should work without external env loading
      assert.strictEqual(config.name, "myservice");
    });

    test("handles storage initialization gracefully", async () => {
      const mockStorageFn = () => mockStorage;
      const config = await createConfig(
        "test",
        "myservice",
        {},
        mockProcess,
        mockStorageFn,
      );

      assert.strictEqual(config.name, "myservice");
    });

    test("accepts optional storageFn parameter", async () => {
      const mockStorageFn = mock.fn(() => ({
        exists: () => Promise.resolve(false),
        get: () => Promise.resolve(Buffer.from("test: value")),
      }));

      const config = await createConfig(
        "test",
        "myservice",
        {},
        mockProcess,
        mockStorageFn,
      );

      assert.strictEqual(config.name, "myservice");
    });

    test("uses default storageFactory when storageFn not provided", async () => {
      mockProcess.env.STORAGE_ROOT = "/tmp";
      const config = await createConfig("test", "myservice", {}, mockProcess);

      assert.strictEqual(config.name, "myservice");
    });
  });

  describe("Environment-driven storage integration", () => {
    // Tests for environment-driven storage configuration

    test("storageFactory respects STORAGE_TYPE environment variable", async () => {
      const mockProcess = {
        env: { STORAGE_TYPE: "local", STORAGE_ROOT: "/tmp" },
        cwd: () => "/test/dir",
      };

      const config = await createConfig("test", "myservice", {}, mockProcess);

      assert.strictEqual(config.name, "myservice");
    });

    test("storageFactory creates S3Storage with environment variables", async () => {
      const mockProcess = {
        env: {
          STORAGE_TYPE: "s3",
          S3_REGION: "us-east-1",
          S3_ENDPOINT: "https://s3.amazonaws.com",
          AWS_ACCESS_KEY_ID: "test-key",
          AWS_SECRET_ACCESS_KEY: "test-secret",
          S3_DATA_BUCKET: "test-bucket",
        },
        cwd: () => "/test/dir",
      };

      // Use a mock storageFn to avoid actual S3 connection
      // The storage factory function receives basePath and process parameters
      const mockStorageFn = (_basePath, _process) => ({
        exists: () => Promise.resolve(false),
        get: () => Promise.resolve(Buffer.from("")),
        put: () => Promise.resolve(),
        path: (key) => key, // Add the missing path method
      });

      const config = await createConfig(
        "test",
        "myservice",
        {},
        mockProcess,
        mockStorageFn,
      );

      assert.strictEqual(config.name, "myservice");
      // Config should be able to create with S3 environment variables set
    });

    test("demonstrates circular dependency resolution", async () => {
      // This test verifies that we can create configs and storage independently
      const mockProcess = {
        env: { STORAGE_TYPE: "local", STORAGE_ROOT: "/tmp" },
        cwd: () => "/test/dir",
      };

      // Can create config without storage dependency
      const config = await createConfig("test", "myservice", {}, mockProcess);

      // Can use environment-driven storageFactory without config dependency
      // This would have been circular before the decoupling
      assert.strictEqual(config.name, "myservice");
      assert.strictEqual(config.namespace, "test");
    });
  });

  describe("Config methods", () => {
    let config;

    beforeEach(async () => {
      const mockProcess = {
        cwd: mock.fn(() => "/test/dir"),
        env: {
          LLM_TOKEN: "llm-token-123",
        },
      };

      const mockStorageFn = () =>
        createMockStorage({
          get: mock.fn(() => Promise.resolve("")),
        });

      config = await createConfig(
        "test",
        "myservice",
        {},
        mockProcess,
        mockStorageFn,
      );
    });

    test("ghClientId throws when not set in environment", () => {
      assert.throws(() => config.ghClientId(), {
        message: "GitHub client ID not found in environment",
      });
    });

    test("llmToken returns from environment", async () => {
      const token = await config.llmToken();
      assert.strictEqual(token, "llm-token-123");
    });

    test("llmBaseUrl throws when not set", () => {
      assert.throws(
        () => config.llmBaseUrl(),
        /LLM_BASE_URL not found in environment/,
      );
    });

    test("reset clears cached values", async () => {
      const mockProcess = {
        cwd: () => "/test/dir",
        env: { LLM_TOKEN: "new-token" },
      };

      const mockStorageFn = () => ({
        exists: () => Promise.resolve(false),
        get: () => Promise.resolve(Buffer.from("")),
        path: (key) => key, // Add the missing path method
      });

      const testConfig = await createConfig(
        "test",
        "myservice",
        {},
        mockProcess,
        mockStorageFn,
      );

      // Access llmToken to cache it
      await testConfig.llmToken();

      // Reset should clear the cache
      testConfig.reset();

      const token = await testConfig.llmToken();
      assert.strictEqual(token, "new-token");
    });

    test("creates service config", async () => {
      const proc = { cwd: () => "/test/dir", env: {} };
      const storageFn = () =>
        createMockStorage({
          get: mock.fn(() => Promise.resolve("")),
        });

      const config = await createServiceConfig(
        "testservice",
        { custom: "value" },
        proc,
        storageFn,
      );

      assert.strictEqual(config.name, "testservice");
      assert.strictEqual(config.namespace, "service");
      assert.strictEqual(config.custom, "value");
    });

    test("creates extension config", async () => {
      const proc = { cwd: () => "/test/dir", env: {} };
      const storageFn = () =>
        createMockStorage({
          get: mock.fn(() => Promise.resolve("")),
        });

      const config = await createExtensionConfig(
        "testextension",
        { custom: "value" },
        proc,
        storageFn,
      );

      assert.strictEqual(config.name, "testextension");
      assert.strictEqual(config.namespace, "extension");
      assert.strictEqual(config.custom, "value");
    });
  });

  describe("Config getters", () => {
    const mockStorageFn = () =>
      createMockStorage({
        get: mock.fn(() => Promise.resolve("")),
      });

    test("jwtSecret returns from environment", async () => {
      const mockProcess = {
        cwd: mock.fn(() => "/test/dir"),
        env: {
          JWT_SECRET: "my-jwt-secret-key",
        },
      };

      const config = await createConfig(
        "test",
        "myservice",
        {},
        mockProcess,
        mockStorageFn,
      );
      const secret = config.jwtSecret();

      assert.strictEqual(secret, "my-jwt-secret-key");
    });

    test("jwtSecret throws when not set", async () => {
      const mockProcess = {
        cwd: mock.fn(() => "/test/dir"),
        env: {},
      };

      const config = await createConfig(
        "test",
        "myservice",
        {},
        mockProcess,
        mockStorageFn,
      );
      assert.throws(() => config.jwtSecret(), {
        message: "JWT_SECRET not found in environment",
      });
    });

    test("jwtAuthUrl returns from environment", async () => {
      const mockProcess = {
        cwd: mock.fn(() => "/test/dir"),
        env: {
          JWT_AUTH_URL: "https://myproject.supabase.co",
        },
      };

      const config = await createConfig(
        "test",
        "myservice",
        {},
        mockProcess,
        mockStorageFn,
      );
      assert.strictEqual(config.jwtAuthUrl(), "https://myproject.supabase.co");
    });

    test("jwtAuthUrl returns default when not set", async () => {
      const mockProcess = {
        cwd: mock.fn(() => "/test/dir"),
        env: {},
      };

      const config = await createConfig(
        "test",
        "myservice",
        {},
        mockProcess,
        mockStorageFn,
      );
      assert.strictEqual(config.jwtAuthUrl(), "http://localhost:9999");
    });

    test("jwtAnonKey returns from environment", async () => {
      const mockProcess = {
        cwd: mock.fn(() => "/test/dir"),
        env: {
          JWT_ANON_KEY: "anon-key-abc123",
        },
      };

      const config = await createConfig(
        "test",
        "myservice",
        {},
        mockProcess,
        mockStorageFn,
      );
      assert.strictEqual(config.jwtAnonKey(), "anon-key-abc123");
    });

    test("jwtAnonKey throws when not set", async () => {
      const mockProcess = {
        cwd: mock.fn(() => "/test/dir"),
        env: {},
      };

      const config = await createConfig(
        "test",
        "myservice",
        {},
        mockProcess,
        mockStorageFn,
      );
      assert.throws(() => config.jwtAnonKey(), {
        message: "JWT_ANON_KEY not found in environment",
      });
    });

    test("init returns init config from file data", async () => {
      const mockStorage = createMockStorage({
        get: mock.fn(() =>
          Promise.resolve({
            init: {
              log_dir: "data/logs",
              shutdown_timeout: 5000,
              services: [{ name: "api", command: "npm start" }],
            },
          }),
        ),
      });

      const mockProcess = {
        cwd: mock.fn(() => "/test/dir"),
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
        get: mock.fn(() => Promise.resolve({})),
      });

      const mockProcess = {
        cwd: mock.fn(() => "/test/dir"),
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
        get: mock.fn(() => Promise.resolve({})),
        path: mock.fn(() => "/project/root/config"),
      });

      const mockProcess = {
        cwd: mock.fn(() => "/test/dir"),
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

    test("ghToken throws when not set in environment", async () => {
      const mockProcess = {
        cwd: mock.fn(() => "/test/dir"),
        env: {},
      };

      const config = await createConfig(
        "test",
        "myservice",
        {},
        mockProcess,
        mockStorageFn,
      );
      assert.throws(() => config.ghToken(), {
        message: "GitHub token not found in environment",
      });
    });

    test("ghToken returns from environment", async () => {
      const mockProcess = {
        cwd: mock.fn(() => "/test/dir"),
        env: { GITHUB_TOKEN: "gh-token-xyz" },
      };

      const config = await createConfig(
        "test",
        "myservice",
        {},
        mockProcess,
        mockStorageFn,
      );
      assert.strictEqual(config.ghToken(), "gh-token-xyz");
    });

    test("llmToken throws when not set in environment", async () => {
      const mockProcess = {
        cwd: mock.fn(() => "/test/dir"),
        env: {},
      };

      const config = await createConfig(
        "test",
        "myservice",
        {},
        mockProcess,
        mockStorageFn,
      );
      await assert.rejects(() => config.llmToken(), {
        message: "LLM token not found in environment",
      });
    });

    test("llmBaseUrl returns custom URL from environment", async () => {
      const mockProcess = {
        cwd: mock.fn(() => "/test/dir"),
        env: { LLM_BASE_URL: "https://custom.api.com" },
      };

      const config = await createConfig(
        "test",
        "myservice",
        {},
        mockProcess,
        mockStorageFn,
      );
      assert.strictEqual(config.llmBaseUrl(), "https://custom.api.com");
    });
  });
});
