import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";

// Module under test
import { Logger, createLogger } from "@forwardimpact/libtelemetry";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

describe("Logger", () => {
  let originalDebug;
  let consoleOutput;
  let originalConsoleError;

  beforeEach(() => {
    originalDebug = process.env.DEBUG;
    consoleOutput = [];
    originalConsoleError = console.error;
    console.error = (message) => consoleOutput.push(message);
  });

  afterEach(() => {
    process.env.DEBUG = originalDebug;
    console.error = originalConsoleError;
  });

  test("creates Logger with domain", () => {
    const logger = new Logger("test", createDefaultRuntime());

    assert.ok(logger instanceof Logger);
    assert.strictEqual(logger.domain, "test");
  });

  test("validates constructor parameters", () => {
    assert.throws(() => new Logger(), {
      message: /domain must be a non-empty string/,
    });
    assert.throws(() => new Logger("", createDefaultRuntime()), {
      message: /domain must be a non-empty string/,
    });
    assert.throws(() => new Logger(null), {
      message: /domain must be a non-empty string/,
    });
  });

  test("enables logging when DEBUG=*", () => {
    process.env.DEBUG = "*";
    const logger = new Logger("test", createDefaultRuntime());

    assert.strictEqual(logger.enabled, true);
  });

  test("disables logging when DEBUG is empty", () => {
    process.env.DEBUG = "";
    const logger = new Logger("test", createDefaultRuntime());

    assert.strictEqual(logger.enabled, false);
  });

  test("enables logging for exact domain match", () => {
    process.env.DEBUG = "test,other";
    const logger = new Logger("test", createDefaultRuntime());

    assert.strictEqual(logger.enabled, true);
  });

  test("enables logging for wildcard pattern match", () => {
    process.env.DEBUG = "test*";
    const logger = new Logger("test:service", createDefaultRuntime());

    assert.strictEqual(logger.enabled, true);
  });

  test("disables logging for non-matching domain", () => {
    process.env.DEBUG = "other";
    const logger = new Logger("test", createDefaultRuntime());

    assert.strictEqual(logger.enabled, false);
  });

  test("logs debug message when enabled", () => {
    process.env.DEBUG = "test";
    const logger = new Logger("test", createDefaultRuntime());

    logger.debug("TestApp", "Test message");

    assert.strictEqual(consoleOutput.length, 1);
    assert.ok(consoleOutput[0].includes("DEBUG"));
    assert.ok(consoleOutput[0].includes("test"));
    assert.ok(consoleOutput[0].includes("TestApp"));
    assert.ok(consoleOutput[0].includes("Test message"));
  });

  test("does not log when disabled", () => {
    process.env.DEBUG = "other";
    const logger = new Logger("test", createDefaultRuntime());

    logger.debug("TestApp", "Test message");

    assert.strictEqual(consoleOutput.length, 0);
  });

  test("handles empty data object", () => {
    process.env.DEBUG = "test";
    const logger = new Logger("test", createDefaultRuntime());

    logger.debug("TestApp", "Test message", {});

    assert.strictEqual(consoleOutput.length, 1);
    assert.ok(consoleOutput[0].includes("DEBUG"));
    assert.ok(consoleOutput[0].includes("Test message"));
  });

  test("includes timestamp in log output", () => {
    process.env.DEBUG = "test";
    const logger = new Logger("test", createDefaultRuntime());

    logger.debug("TestApp", "Test message");

    assert.strictEqual(consoleOutput.length, 1);
    assert.ok(consoleOutput[0].match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/));
  });

  test("merges trace context with provided attributes", () => {
    process.env.DEBUG = "test";
    const logger = new Logger("test", createDefaultRuntime());

    const error = new Error("Test error");
    Object.defineProperty(error, "trace_id", {
      value: "trace123",
      enumerable: false,
      writable: false,
    });

    logger.error("TestMethod", error, { retry: "1/3", status: "500" });

    assert.strictEqual(consoleOutput.length, 1);
    assert.ok(consoleOutput[0].includes('trace_id="trace123"'));
    assert.ok(consoleOutput[0].includes('retry="1/3"'));
    assert.ok(consoleOutput[0].includes('status="500"'));
  });

  test("exception logs message when disabled", () => {
    process.env.DEBUG = "other";
    const logger = new Logger("test", createDefaultRuntime());

    const error = new Error("Test error");

    logger.exception("TestMethod", error);

    assert.strictEqual(consoleOutput.length, 1);
    assert.ok(consoleOutput[0].includes("ERROR"));
    assert.ok(consoleOutput[0].includes("Test error"));
    assert.ok(
      !consoleOutput[0].includes("at "),
      "Should not include stack trace when disabled",
    );
  });

  test("exception logs message with stack trace when enabled", () => {
    process.env.DEBUG = "test";
    const logger = new Logger("test", createDefaultRuntime());

    const error = new Error("Test error");

    logger.exception("TestMethod", error);

    assert.strictEqual(consoleOutput.length, 1);
    assert.ok(consoleOutput[0].includes("ERROR"));
    assert.ok(consoleOutput[0].includes("Test error"));
    assert.ok(
      consoleOutput[0].includes("at "),
      "Should include stack trace when enabled",
    );
  });

  test("exception extracts trace context from error", () => {
    process.env.DEBUG = "test";
    const logger = new Logger("test", createDefaultRuntime());

    const error = new Error("Test error");
    error.trace_id = "trace456";
    error.span_id = "span789";
    error.service_name = "my-service";

    logger.exception("TestMethod", error);

    assert.strictEqual(consoleOutput.length, 1);
    assert.ok(consoleOutput[0].includes('trace_id="trace456"'));
    assert.ok(consoleOutput[0].includes('span_id="span789"'));
    assert.ok(consoleOutput[0].includes('service_name="my-service"'));
  });

  test("exception merges trace context with provided attributes", () => {
    process.env.DEBUG = "test";
    const logger = new Logger("test", createDefaultRuntime());

    const error = new Error("Test error");
    error.trace_id = "trace123";

    logger.exception("TestMethod", error, { retry: "2/3" });

    assert.strictEqual(consoleOutput.length, 1);
    assert.ok(consoleOutput[0].includes('trace_id="trace123"'));
    assert.ok(consoleOutput[0].includes('retry="2/3"'));
  });
});

describe("createLogger", () => {
  test("creates Logger instance", () => {
    const logger = createLogger("test", createDefaultRuntime());

    assert.ok(logger instanceof Logger);
    assert.strictEqual(logger.domain, "test");
  });

  test("passes through domain validation", () => {
    assert.throws(() => createLogger("", createDefaultRuntime()), {
      message: /domain must be a non-empty string/,
    });
  });
});
