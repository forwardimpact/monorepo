import { test, describe } from "node:test";
import assert from "node:assert";

import { createAuth, HmacAuth } from "../src/index.js";
import {
  assertThrowsMessage,
  createMockClock,
  createMockProcess,
  createTestRuntime,
} from "@forwardimpact/libmock";

describe("Auth", () => {
  describe("HmacAuth", () => {
    test("should throw if secret is missing or too short", () => {
      assertThrowsMessage(
        () => new HmacAuth(),
        /Secret must be a non-empty string/,
      );
      assertThrowsMessage(
        () => new HmacAuth("short"),
        /Secret must be at least 32 characters long/,
      );
    });

    test("should generate and verify valid tokens", () => {
      const secret = "test-secret-that-is-at-least-32-characters-long";
      const auth = new HmacAuth(secret);
      const serviceId = "test-service";

      const token = auth.generateToken(serviceId);
      assert.ok(token);

      const result = auth.verifyToken(token);
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.serviceId, serviceId);
    });

    test("should reject expired tokens", () => {
      const secret = "test-secret-that-is-at-least-32-characters-long";
      // 1 second lifetime, with an injected clock so the test doesn't
      // have to sleep through real time.
      const clock = createMockClock({ start: 1_000_000 });
      const auth = new HmacAuth(secret, 1, { now: clock.now });
      const serviceId = "test-service";

      const token = auth.generateToken(serviceId);

      // Move past the 1-second lifetime.
      clock.advance(1100);

      const result = auth.verifyToken(token);
      assert.strictEqual(result.isValid, false);
      assert.match(result.error, /Token has expired/);
    });

    test("should reject invalid signatures", () => {
      const secret = "test-secret-that-is-at-least-32-characters-long";
      const auth = new HmacAuth(secret);
      const serviceId = "test-service";

      const token = auth.generateToken(serviceId);

      // Tamper with the token (it's base64 encoded)
      const decoded = Buffer.from(token, "base64").toString("utf8");
      const parts = decoded.split(":");
      // Change serviceId part
      parts[0] = "other-service";
      const tamperedToken = Buffer.from(parts.join(":")).toString("base64");

      const result = auth.verifyToken(tamperedToken);
      assert.strictEqual(result.isValid, false);
      assert.match(result.error, /Invalid token signature/);
    });
  });

  describe("createAuth", () => {
    const runtimeWithSecret = (secret) =>
      createTestRuntime({
        proc: createMockProcess({
          env: secret ? { SERVICE_SECRET: secret } : {},
        }),
      });

    test("should throw if no runtime is injected", () => {
      assertThrowsMessage(
        () => createAuth("test"),
        /createAuth requires an injected runtime/,
      );
    });

    test("should throw if SERVICE_SECRET is missing", () => {
      assertThrowsMessage(
        () => createAuth("test", runtimeWithSecret()),
        /SERVICE_SECRET environment variable is required/,
      );
    });

    test("should create Interceptor with valid secret", () => {
      const interceptor = createAuth(
        "test",
        runtimeWithSecret("test-secret-that-is-at-least-32-characters-long"),
      );
      assert.ok(interceptor);
    });
  });
});
