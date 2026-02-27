import { test, describe } from "node:test";
import assert from "node:assert";
import {
  createMockConfig,
  createMockServiceConfig,
  createMockExtensionConfig,
} from "../mock/config.js";
import { createMockStorage, MockStorage } from "../mock/storage.js";
import { createMockLogger, createSilentLogger } from "../mock/logger.js";

describe("libharness", () => {
  test("createMockConfig creates config with defaults", () => {
    const config = createMockConfig();
    assert.strictEqual(config.name, "test-service");
    assert.strictEqual(config.namespace, "test");
    assert.strictEqual(config.port, 3000);
  });

  test("createMockConfig accepts overrides", () => {
    const config = createMockConfig("custom", { port: 5000 });
    assert.strictEqual(config.name, "custom");
    assert.strictEqual(config.port, 5000);
  });

  test("createMockServiceConfig includes service properties", () => {
    const config = createMockServiceConfig("test");
    assert.strictEqual(config.budget, 1000);
    assert.strictEqual(config.threshold, 0.3);
  });

  test("createMockExtensionConfig includes extension properties", () => {
    const config = createMockExtensionConfig("test");
    assert.strictEqual(config.secret, "test-secret");
    assert.ok(config.llmToken);
  });

  test("createMockStorage provides storage interface", async () => {
    const storage = createMockStorage();
    await storage.put("key", "value");
    assert.strictEqual(storage.data.get("key"), "value");
    const exists = await storage.exists("key");
    assert.strictEqual(exists, true);
  });

  test("MockStorage class provides storage interface", async () => {
    const storage = new MockStorage();
    await storage.put("key", "value");
    assert.strictEqual(storage.data.get("key"), "value");
    const exists = await storage.exists("key");
    assert.strictEqual(exists, true);
  });

  test("createMockLogger provides logger interface", () => {
    const logger = createMockLogger();
    logger.debug("app", "message", {});
    assert.strictEqual(logger.debug.mock.calls.length, 1);
  });

  test("createSilentLogger provides no-op logger", () => {
    const logger = createSilentLogger();
    logger.debug("app", "message");
    logger.info("app", "message");
  });

  test("createMockStorage JSON parsing", async () => {
    const storage = createMockStorage();
    await storage.put("test.json", JSON.stringify({ foo: "bar" }));
    const result = await storage.get("test.json");
    assert.deepStrictEqual(result, { foo: "bar" });
  });

  test("createMockStorage JSONL parsing", async () => {
    const storage = createMockStorage();
    const lines = ['{"a":1}', '{"b":2}'].join("\n");
    await storage.put("test.jsonl", lines);
    const result = await storage.get("test.jsonl");
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], { a: 1 });
  });

  test("createMockStorage append", async () => {
    const storage = createMockStorage();
    await storage.append("key", "line1");
    await storage.append("key", "line2");
    const value = storage.data.get("key");
    assert.strictEqual(value, "line1\nline2");
  });
});
