import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { createAuth, HmacAuth } from "../index.js";

describe("Auth", () => {
  describe("HmacAuth", () => {
    test("should throw if secret is missing or too short", () => {
      assert.throws(() => new HmacAuth(), /Secret must be a non-empty string/);
      assert.throws(
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

    test("should reject expired tokens", async () => {
      const secret = "test-secret-that-is-at-least-32-characters-long";
      // 1 second lifetime
      const auth = new HmacAuth(secret, 1);
      const serviceId = "test-service";

      const token = auth.generateToken(serviceId);

      // Wait for token to expire (1.1 seconds)
      await new Promise((resolve) => setTimeout(resolve, 1100));

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
    let originalEnv;

    beforeEach(() => {
      originalEnv = process.env.SERVICE_SECRET;
    });

    test("should throw if SERVICE_SECRET is missing", () => {
      delete process.env.SERVICE_SECRET;
      assert.throws(
        () => createAuth("test"),
        /SERVICE_SECRET environment variable is required/,
      );
    });

    test("should create Interceptor with valid secret", () => {
      process.env.SERVICE_SECRET =
        "test-secret-that-is-at-least-32-characters-long";
      const interceptor = createAuth("test");
      assert.ok(interceptor);

      // Cleanup
      if (originalEnv) {
        process.env.SERVICE_SECRET = originalEnv;
      } else {
        delete process.env.SERVICE_SECRET;
      }
    });
  });
});
