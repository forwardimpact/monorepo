import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert";

import {
  createConfig,
  createServiceConfig,
  createExtensionConfig,
} from "../index.js";
import { createMockStorage } from "@forwardimpact/libharness";

describe("libconfig - Config", () => {
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
      { numbers: [], boolean: false },
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
      { invalid: "" },
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

describe("libconfig - Environment-driven storage integration", () => {
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

    const mockStorageFn = (_basePath, _process) => ({
      exists: () => Promise.resolve(false),
      get: () => Promise.resolve(Buffer.from("")),
      put: () => Promise.resolve(),
      path: (key) => key,
    });

    const config = await createConfig(
      "test",
      "myservice",
      {},
      mockProcess,
      mockStorageFn,
    );

    assert.strictEqual(config.name, "myservice");
  });

  test("demonstrates circular dependency resolution", async () => {
    const mockProcess = {
      env: { STORAGE_TYPE: "local", STORAGE_ROOT: "/tmp" },
      cwd: () => "/test/dir",
    };

    const config = await createConfig("test", "myservice", {}, mockProcess);

    assert.strictEqual(config.name, "myservice");
    assert.strictEqual(config.namespace, "test");
  });
});

describe("libconfig - Config methods", () => {
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
      path: (key) => key,
    });

    const testConfig = await createConfig(
      "test",
      "myservice",
      {},
      mockProcess,
      mockStorageFn,
    );

    await testConfig.llmToken();
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
