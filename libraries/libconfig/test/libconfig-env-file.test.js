import { test, describe, mock, afterEach } from "node:test";
import assert from "node:assert";
import { writeFileSync, mkdirSync, rmSync, chmodSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import { createConfig } from "../index.js";
import { createMockStorage } from "@forwardimpact/libharness";

describe("libconfig - .env file loading", () => {
  const testDir = path.join(tmpdir(), `libconfig-env-test-${process.pid}`);
  const envPath = path.join(testDir, ".env");

  const mockStorageFn = () =>
    createMockStorage({
      get: mock.fn(() => Promise.resolve("")),
    });

  const createProcess = (env = {}) => ({
    cwd: () => testDir,
    env,
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true });
    } catch {
      // ignore
    }
  });

  function writeEnvFile(content) {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(envPath, content, "utf8");
  }

  test("loads allowed keys from .env file", async () => {
    writeEnvFile("JWT_SECRET=from-env-file\nLLM_TOKEN=my-llm-token\n");

    const config = await createConfig(
      "test",
      "svc",
      {},
      createProcess(),
      mockStorageFn,
    );

    assert.strictEqual(config.jwtSecret(), "from-env-file");
    const token = await config.llmToken();
    assert.strictEqual(token, "my-llm-token");
  });

  test("process.env takes precedence over .env file", async () => {
    writeEnvFile("JWT_SECRET=file-value\n");

    const config = await createConfig(
      "test",
      "svc",
      {},
      createProcess({ JWT_SECRET: "env-value" }),
      mockStorageFn,
    );

    assert.strictEqual(config.jwtSecret(), "env-value");
  });

  test("loads non-allowed keys into process.env", async () => {
    writeEnvFile(
      "SERVICE_SECRET=my-secret\nSERVICE_AGENT_URL=grpc://localhost:3002\nJWT_SECRET=allowed\n",
    );

    const mockProcess = createProcess();
    const config = await createConfig(
      "test",
      "svc",
      {},
      mockProcess,
      mockStorageFn,
    );

    assert.strictEqual(config.jwtSecret(), "allowed");
    assert.strictEqual(mockProcess.env.SERVICE_SECRET, "my-secret");
    assert.strictEqual(
      mockProcess.env.SERVICE_AGENT_URL,
      "grpc://localhost:3002",
    );
  });

  test("process.env takes precedence for non-allowed keys", async () => {
    writeEnvFile("SERVICE_SECRET=from-file\n");

    const mockProcess = createProcess({ SERVICE_SECRET: "from-env" });
    await createConfig("test", "svc", {}, mockProcess, mockStorageFn);

    assert.strictEqual(mockProcess.env.SERVICE_SECRET, "from-env");
  });

  test("skips comments and blank lines", async () => {
    writeEnvFile(
      "# This is a comment\n\n  \nJWT_SECRET=secret-value\n# another comment\n",
    );

    const config = await createConfig(
      "test",
      "svc",
      {},
      createProcess(),
      mockStorageFn,
    );

    assert.strictEqual(config.jwtSecret(), "secret-value");
  });

  test("strips surrounding quotes from values", async () => {
    writeEnvFile(
      "JWT_SECRET=\"double-quoted\"\nGITHUB_TOKEN='single-quoted'\n",
    );

    const config = await createConfig(
      "test",
      "svc",
      {},
      createProcess(),
      mockStorageFn,
    );

    assert.strictEqual(config.jwtSecret(), "double-quoted");
    assert.strictEqual(config.ghToken(), "single-quoted");
  });

  test("handles values containing equals signs", async () => {
    writeEnvFile("JWT_SECRET=abc=def=ghi\n");

    const config = await createConfig(
      "test",
      "svc",
      {},
      createProcess(),
      mockStorageFn,
    );

    assert.strictEqual(config.jwtSecret(), "abc=def=ghi");
  });

  test("continues gracefully when .env file does not exist", async () => {
    mkdirSync(testDir, { recursive: true });
    // No .env file written

    const config = await createConfig(
      "test",
      "svc",
      {},
      createProcess(),
      mockStorageFn,
    );

    assert.throws(() => config.jwtSecret(), {
      message: "JWT_SECRET not found in environment",
    });
  });

  test("throws on non-ENOENT errors (e.g. permission denied)", async (t) => {
    if (process.getuid?.() === 0) {
      t.skip("cannot enforce file permissions as root");
      return;
    }

    writeEnvFile("JWT_SECRET=secret\n");
    chmodSync(envPath, 0o000);

    await assert.rejects(
      () => createConfig("test", "svc", {}, createProcess(), mockStorageFn),
      (error) => error.code === "EACCES",
    );

    // Restore permissions so afterEach cleanup works
    chmodSync(envPath, 0o644);
  });

  test("does not set .env values on the data object", async () => {
    writeEnvFile("JWT_SECRET=secret\nGITHUB_TOKEN=token\n");

    const config = await createConfig(
      "test",
      "svc",
      {},
      createProcess(),
      mockStorageFn,
    );

    // These should only be accessible via getter methods, not as properties
    assert.strictEqual(config.JWT_SECRET, undefined);
    assert.strictEqual(config.GITHUB_TOKEN, undefined);
  });

  test("reset clears .env overrides", async () => {
    writeEnvFile("JWT_SECRET=from-file\n");

    const config = await createConfig(
      "test",
      "svc",
      {},
      createProcess(),
      mockStorageFn,
    );

    assert.strictEqual(config.jwtSecret(), "from-file");
    config.reset();

    // After reset, .env overrides are cleared and no process env either
    assert.throws(() => config.jwtSecret(), {
      message: "JWT_SECRET not found in environment",
    });
  });

  test("loads all allowed keys", async () => {
    writeEnvFile(
      [
        "GITHUB_CLIENT_ID=client-id",
        "GITHUB_TOKEN=gh-token",
        "LLM_TOKEN=llm-tok",
        "LLM_BASE_URL=https://llm.example.com",
        "EMBEDDING_BASE_URL=https://embed.example.com",
        "JWT_SECRET=jwt-sec",
        "JWT_ANON_KEY=anon-key",
        "JWT_AUTH_URL=https://auth.example.com",
      ].join("\n"),
    );

    const config = await createConfig(
      "test",
      "svc",
      {},
      createProcess(),
      mockStorageFn,
    );

    assert.strictEqual(config.ghClientId(), "client-id");
    assert.strictEqual(config.ghToken(), "gh-token");
    assert.strictEqual(await config.llmToken(), "llm-tok");
    assert.strictEqual(config.llmBaseUrl(), "https://llm.example.com");
    assert.strictEqual(config.embeddingBaseUrl(), "https://embed.example.com");
    assert.strictEqual(config.jwtSecret(), "jwt-sec");
    assert.strictEqual(config.jwtAnonKey(), "anon-key");
    assert.strictEqual(config.jwtAuthUrl(), "https://auth.example.com");
  });

  test("values do not leak via Object.keys or JSON.stringify", async () => {
    writeEnvFile("JWT_SECRET=secret\nGITHUB_TOKEN=token\n");

    const config = await createConfig(
      "test",
      "svc",
      {},
      createProcess(),
      mockStorageFn,
    );

    assert.ok(!Object.keys(config).includes("JWT_SECRET"));
    assert.ok(!Object.keys(config).includes("GITHUB_TOKEN"));
    const serialized = JSON.stringify(config);
    assert.ok(!serialized.includes("secret"));
    assert.ok(!serialized.includes("token"));
  });

  test("strips export prefix on keys", async () => {
    writeEnvFile("export JWT_SECRET=exported-value\n");

    const config = await createConfig(
      "test",
      "svc",
      {},
      createProcess(),
      mockStorageFn,
    );

    assert.strictEqual(config.jwtSecret(), "exported-value");
  });

  test("handles adversarial values safely", async () => {
    writeEnvFile(
      [
        "JWT_SECRET=value\x00with-null",
        "GITHUB_TOKEN=" + "a".repeat(10000),
      ].join("\n"),
    );

    const config = await createConfig(
      "test",
      "svc",
      {},
      createProcess(),
      mockStorageFn,
    );

    assert.strictEqual(config.jwtSecret(), "value\x00with-null");
    assert.strictEqual(config.ghToken().length, 10000);
  });
});
