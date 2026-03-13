/* global Request */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { createWebService } from "../index.js";
import {
  createMockServiceConfig,
  createSilentLogger,
} from "@forwardimpact/libharness";

describe("web service", () => {
  let mockConfig;
  let mockClient;
  let logger;

  beforeEach(() => {
    mockConfig = createMockServiceConfig("web", {
      auth_enabled: false,
    });

    mockClient = {
      ProcessStream: () => (async function* () {})(),
    };

    logger = createSilentLogger();
  });

  describe("createWebService", () => {
    test("returns a Hono app", async () => {
      const app = await createWebService(mockClient, mockConfig, logger);
      assert.ok(app);
      assert.strictEqual(typeof app.fetch, "function");
    });

    test("works without logger", async () => {
      const app = await createWebService(mockClient, mockConfig);
      assert.ok(app);
    });
  });

  describe("health endpoint", () => {
    test("GET /web/health returns ok status", async () => {
      const app = await createWebService(mockClient, mockConfig, logger);

      const req = new Request("http://localhost/web/health", {
        method: "GET",
      });
      const res = await app.fetch(req);

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.deepStrictEqual(body, { status: "ok" });
    });
  });

  describe("chat endpoint", () => {
    test("POST /web/api/chat rejects missing message", async () => {
      const app = await createWebService(mockClient, mockConfig, logger);

      const req = new Request("http://localhost/web/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const res = await app.fetch(req);

      // Validation middleware should reject requests without required 'message' field
      assert.ok(res.status >= 400);
    });

    test("POST /web/api/chat streams response from agent client", async () => {
      const streamClient = {
        ProcessStream: () =>
          (async function* () {
            yield {
              resource_id: "res-1",
              messages: [{ role: "assistant", content: "Hello from agent" }],
            };
          })(),
      };

      const tokenConfig = createMockServiceConfig("web", {
        auth_enabled: false,
        llmToken: async () => "test-token",
      });

      const app = await createWebService(streamClient, tokenConfig, logger);

      const req = new Request("http://localhost/web/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Hello" }),
      });
      const res = await app.fetch(req);

      assert.strictEqual(res.status, 200);
      const text = await res.text();
      assert.ok(text.includes("res-1"));
      assert.ok(text.includes("Hello from agent"));
    });

    test("POST /web/api/chat handles stream error gracefully", async () => {
      const errorClient = {
        ProcessStream: () => ({
          async next() {
            throw new Error("gRPC connection failed");
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        }),
      };

      const tokenConfig = createMockServiceConfig("web", {
        auth_enabled: false,
        llmToken: async () => "test-token",
      });

      const app = await createWebService(errorClient, tokenConfig, logger);

      const req = new Request("http://localhost/web/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Hello" }),
      });
      const res = await app.fetch(req);

      assert.strictEqual(res.status, 200);
      const text = await res.text();
      assert.ok(text.includes("Stream processing failed"));
    });
  });

  describe("auth middleware", () => {
    test("creates app with auth enabled when jwtSecret is configured", async () => {
      const authConfig = createMockServiceConfig("web", {
        auth_enabled: true,
        secret: "test-secret",
        jwtSecret: () => "test-jwt-secret-for-auth-middleware",
      });

      const app = await createWebService(mockClient, authConfig, logger);
      assert.ok(app);
    });
  });
});
