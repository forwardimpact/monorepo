import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";

// Module under test
import { Logger, createLogger } from "@forwardimpact/libtelemetry";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

/**
 * A runtime whose `proc.stderr` captures every line into `sink`. It keeps the
 * live `proc.env`, so `process.env.DEBUG` and `LOG_LEVEL` changes stay
 * visible. It also keeps the real clock. The Logger writes through
 * `runtime.proc.stderr`. So tests inject this runtime. They do not patch the
 * global `console`.
 * @param {string[]} sink - Array that receives each written line.
 * @returns {import("@forwardimpact/libutil/runtime").Runtime}
 */
function captureRuntime(sink) {
  const base = createDefaultRuntime();
  return {
    ...base,
    proc: {
      ...base.proc,
      stderr: {
        write: (s) => {
          sink.push(String(s));
          return true;
        },
      },
    },
  };
}

describe("Logger", () => {
  let originalDebug;
  let originalLogLevel;
  let output;
  let runtime;

  beforeEach(() => {
    originalDebug = process.env.DEBUG;
    originalLogLevel = process.env.LOG_LEVEL;
    output = [];
    runtime = captureRuntime(output);
  });

  afterEach(() => {
    process.env.DEBUG = originalDebug;
    if (originalLogLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = originalLogLevel;
  });

  test("creates a Logger with a domain", () => {
    const logger = new Logger("test", runtime);

    assert.ok(logger instanceof Logger);
    assert.strictEqual(logger.domain, "test");
  });

  test("validates constructor parameters", () => {
    assert.throws(() => new Logger(), {
      message: /domain must be a non-empty string/,
    });
    assert.throws(() => new Logger("", runtime), {
      message: /domain must be a non-empty string/,
    });
    assert.throws(() => new Logger(null), {
      message: /domain must be a non-empty string/,
    });
  });

  test("turns the logger on when DEBUG=*", () => {
    process.env.DEBUG = "*";
    const logger = new Logger("test", runtime);

    assert.strictEqual(logger.enabled, true);
  });

  test("turns the logger off when DEBUG is empty", () => {
    process.env.DEBUG = "";
    const logger = new Logger("test", runtime);

    assert.strictEqual(logger.enabled, false);
  });

  test("turns the logger on for an exact domain match", () => {
    process.env.DEBUG = "test,other";
    const logger = new Logger("test", runtime);

    assert.strictEqual(logger.enabled, true);
  });

  test("turns the logger on for a wildcard pattern match", () => {
    process.env.DEBUG = "test*";
    const logger = new Logger("test:service", runtime);

    assert.strictEqual(logger.enabled, true);
  });

  test("turns the logger off for a domain that does not match", () => {
    process.env.DEBUG = "other";
    const logger = new Logger("test", runtime);

    assert.strictEqual(logger.enabled, false);
  });

  test("logs a debug message when enabled", () => {
    process.env.DEBUG = "test";
    const logger = new Logger("test", runtime);

    logger.debug("TestApp", "Test message");

    assert.strictEqual(output.length, 1);
    assert.ok(output[0].includes("DEBUG"));
    assert.ok(output[0].includes("test"));
    assert.ok(output[0].includes("TestApp"));
    assert.ok(output[0].includes("Test message"));
  });

  test("does not log when disabled", () => {
    process.env.DEBUG = "other";
    const logger = new Logger("test", runtime);

    logger.debug("TestApp", "Test message");

    assert.strictEqual(output.length, 0);
  });

  test("warn logs at the default level", () => {
    const logger = new Logger("test", runtime);

    logger.warn("TestApp", "Heads up");

    assert.strictEqual(output.length, 1);
    assert.ok(output[0].includes("WARN"));
    assert.ok(output[0].includes("Heads up"));
  });

  test("the logger suppresses warn when LOG_LEVEL=error", () => {
    process.env.LOG_LEVEL = "error";
    const logger = new Logger("test", runtime);

    logger.warn("TestApp", "Heads up");

    assert.strictEqual(output.length, 0);
  });

  test("error always logs regardless of LOG_LEVEL", () => {
    process.env.LOG_LEVEL = "error";
    const logger = new Logger("test", runtime);

    logger.error("TestMethod", "boom");

    assert.strictEqual(output.length, 1);
    assert.ok(output[0].includes("ERROR"));
    assert.ok(output[0].includes("boom"));
  });

  test("handles an empty data object", () => {
    process.env.DEBUG = "test";
    const logger = new Logger("test", runtime);

    logger.debug("TestApp", "Test message", {});

    assert.strictEqual(output.length, 1);
    assert.ok(output[0].includes("DEBUG"));
    assert.ok(output[0].includes("Test message"));
  });

  test("includes a timestamp in the log output", () => {
    process.env.DEBUG = "test";
    const logger = new Logger("test", runtime);

    logger.debug("TestApp", "Test message");

    assert.strictEqual(output.length, 1);
    assert.ok(output[0].match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/));
  });

  test("merges the trace context with provided attributes", () => {
    process.env.DEBUG = "test";
    const logger = new Logger("test", runtime);

    const error = new Error("Test error");
    Object.defineProperty(error, "trace_id", {
      value: "trace123",
      enumerable: false,
      writable: false,
    });

    logger.error("TestMethod", error, { retry: "1/3", status: "500" });

    assert.strictEqual(output.length, 1);
    assert.ok(output[0].includes('trace_id="trace123"'));
    assert.ok(output[0].includes('retry="1/3"'));
    assert.ok(output[0].includes('status="500"'));
  });

  test("exception logs the message when disabled", () => {
    process.env.DEBUG = "other";
    const logger = new Logger("test", runtime);

    const error = new Error("Test error");

    logger.exception("TestMethod", error);

    assert.strictEqual(output.length, 1);
    assert.ok(output[0].includes("ERROR"));
    assert.ok(output[0].includes("Test error"));
    assert.ok(
      !output[0].includes("at "),
      "The output must not include a stack trace when disabled",
    );
  });

  test("exception logs the message with a stack trace when enabled", () => {
    process.env.DEBUG = "test";
    const logger = new Logger("test", runtime);

    const error = new Error("Test error");

    logger.exception("TestMethod", error);

    assert.strictEqual(output.length, 1);
    assert.ok(output[0].includes("ERROR"));
    assert.ok(output[0].includes("Test error"));
    assert.ok(
      output[0].includes("at "),
      "The output must include a stack trace when enabled",
    );
  });

  test("exception extracts the trace context from the error", () => {
    process.env.DEBUG = "test";
    const logger = new Logger("test", runtime);

    const error = new Error("Test error");
    error.trace_id = "trace456";
    error.span_id = "span789";
    error.service_name = "my-service";

    logger.exception("TestMethod", error);

    assert.strictEqual(output.length, 1);
    assert.ok(output[0].includes('trace_id="trace456"'));
    assert.ok(output[0].includes('span_id="span789"'));
    assert.ok(output[0].includes('service_name="my-service"'));
  });

  test("exception merges the trace context with provided attributes", () => {
    process.env.DEBUG = "test";
    const logger = new Logger("test", runtime);

    const error = new Error("Test error");
    error.trace_id = "trace123";

    logger.exception("TestMethod", error, { retry: "2/3" });

    assert.strictEqual(output.length, 1);
    assert.ok(output[0].includes('trace_id="trace123"'));
    assert.ok(output[0].includes('retry="2/3"'));
  });
});

describe("createLogger", () => {
  test("creates a Logger instance", () => {
    const logger = createLogger("test", createDefaultRuntime());

    assert.ok(logger instanceof Logger);
    assert.strictEqual(logger.domain, "test");
  });

  test("also validates the domain", () => {
    assert.throws(() => createLogger("", createDefaultRuntime()), {
      message: /domain must be a non-empty string/,
    });
  });
});
