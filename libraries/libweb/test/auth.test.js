import { test, describe, mock } from "node:test";
import assert from "node:assert";
import { createHmac } from "node:crypto";

import { AuthMiddleware, createAuthMiddleware } from "../index.js";

/**
 * Helper to create test JWT
 * @param {object} payload - JWT payload
 * @param {string} secret - Signing secret
 * @returns {string} Signed JWT token
 */
function createTestJwt(payload, secret) {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payloadB64}`)
    .digest("base64url");
  return `${header}.${payloadB64}.${signature}`;
}

/**
 * Helper to create mock config
 * @param {string} secret - JWT secret
 * @returns {object} Mock config object
 */
function createMockConfig(secret) {
  return { jwtSecret: () => secret };
}

/**
 * Helper to create mock Hono context
 * @param {string|null} authHeader - Authorization header value
 * @returns {object} Mock context
 */
function createMockContext(authHeader) {
  return {
    req: { header: () => authHeader },
    json: mock.fn((data, status) => ({ data, status })),
    set: mock.fn(),
  };
}

describe("AuthMiddleware", () => {
  const testSecret = "test-jwt-secret-key-12345";

  describe("constructor", () => {
    test("throws error when config is not provided", () => {
      assert.throws(() => new AuthMiddleware(null), {
        message: "config is required",
      });
    });

    test("throws error when JWT_SECRET is not set", () => {
      const mockConfig = { jwtSecret: () => undefined };
      assert.throws(() => new AuthMiddleware(mockConfig), {
        message: "JWT_SECRET environment variable is required",
      });
    });

    test("creates middleware when config has jwtSecret", () => {
      const mockConfig = createMockConfig(testSecret);
      const middleware = new AuthMiddleware(mockConfig);
      assert.ok(middleware instanceof AuthMiddleware);
    });
  });

  describe("create()", () => {
    test("rejects requests without authorization header", async () => {
      const mockConfig = createMockConfig(testSecret);
      const middleware = new AuthMiddleware(mockConfig);
      const handler = middleware.create();

      const mockContext = createMockContext(null);
      let nextCalled = false;

      await handler(mockContext, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(mockContext.json.mock.calls.length, 1);
      assert.strictEqual(mockContext.json.mock.calls[0].arguments[1], 401);
      assert.deepStrictEqual(mockContext.json.mock.calls[0].arguments[0], {
        error: "Missing authorization header",
      });
    });

    test("rejects requests with non-Bearer authorization", async () => {
      const mockConfig = createMockConfig(testSecret);
      const middleware = new AuthMiddleware(mockConfig);
      const handler = middleware.create();

      const mockContext = createMockContext("Basic abc123");
      let nextCalled = false;

      await handler(mockContext, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(mockContext.json.mock.calls[0].arguments[1], 401);
    });

    test("rejects requests with invalid token format", async () => {
      const mockConfig = createMockConfig(testSecret);
      const middleware = new AuthMiddleware(mockConfig);
      const handler = middleware.create();

      const mockContext = createMockContext("Bearer invalid-token");
      let nextCalled = false;

      await handler(mockContext, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(mockContext.json.mock.calls[0].arguments[1], 401);
      assert.deepStrictEqual(mockContext.json.mock.calls[0].arguments[0], {
        error: "Invalid token format",
      });
    });

    test("rejects requests with invalid signature", async () => {
      const mockConfig = createMockConfig(testSecret);
      const middleware = new AuthMiddleware(mockConfig);
      const handler = middleware.create();

      // Create token with wrong secret
      const token = createTestJwt(
        {
          sub: "user-123",
          aud: "authenticated",
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        "wrong-secret",
      );

      const mockContext = createMockContext(`Bearer ${token}`);
      let nextCalled = false;

      await handler(mockContext, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(mockContext.json.mock.calls[0].arguments[1], 401);
      assert.deepStrictEqual(mockContext.json.mock.calls[0].arguments[0], {
        error: "Invalid signature",
      });
    });

    test("rejects expired tokens", async () => {
      const mockConfig = createMockConfig(testSecret);
      const middleware = new AuthMiddleware(mockConfig);
      const handler = middleware.create();

      const token = createTestJwt(
        {
          sub: "user-123",
          aud: "authenticated",
          exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
        },
        testSecret,
      );

      const mockContext = createMockContext(`Bearer ${token}`);
      let nextCalled = false;

      await handler(mockContext, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(mockContext.json.mock.calls[0].arguments[1], 401);
      assert.deepStrictEqual(mockContext.json.mock.calls[0].arguments[0], {
        error: "Token expired",
      });
    });

    test("rejects tokens without expiration", async () => {
      const mockConfig = createMockConfig(testSecret);
      const middleware = new AuthMiddleware(mockConfig);
      const handler = middleware.create();

      const token = createTestJwt(
        {
          sub: "user-123",
          aud: "authenticated",
          // No exp claim
        },
        testSecret,
      );

      const mockContext = createMockContext(`Bearer ${token}`);
      let nextCalled = false;

      await handler(mockContext, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(mockContext.json.mock.calls[0].arguments[1], 401);
      assert.deepStrictEqual(mockContext.json.mock.calls[0].arguments[0], {
        error: "Token missing expiration",
      });
    });

    test("rejects tokens issued in the future", async () => {
      const mockConfig = createMockConfig(testSecret);
      const middleware = new AuthMiddleware(mockConfig);
      const handler = middleware.create();

      const token = createTestJwt(
        {
          sub: "user-123",
          aud: "authenticated",
          exp: Math.floor(Date.now() / 1000) + 7200,
          iat: Math.floor(Date.now() / 1000) + 600, // 10 min in the future (beyond 5 min tolerance)
        },
        testSecret,
      );

      const mockContext = createMockContext(`Bearer ${token}`);
      let nextCalled = false;

      await handler(mockContext, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(mockContext.json.mock.calls[0].arguments[1], 401);
      assert.deepStrictEqual(mockContext.json.mock.calls[0].arguments[0], {
        error: "Token issued in the future",
      });
    });

    test("rejects tokens with invalid algorithm", async () => {
      const mockConfig = createMockConfig(testSecret);
      const middleware = new AuthMiddleware(mockConfig);
      const handler = middleware.create();

      // Create token with wrong algorithm in header
      const header = Buffer.from(
        JSON.stringify({ alg: "none", typ: "JWT" }),
      ).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({
          sub: "user-123",
          aud: "authenticated",
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString("base64url");
      const signature = createHmac("sha256", testSecret)
        .update(`${header}.${payload}`)
        .digest("base64url");
      const token = `${header}.${payload}.${signature}`;

      const mockContext = createMockContext(`Bearer ${token}`);
      let nextCalled = false;

      await handler(mockContext, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(mockContext.json.mock.calls[0].arguments[1], 401);
      assert.deepStrictEqual(mockContext.json.mock.calls[0].arguments[0], {
        error: "Invalid algorithm",
      });
    });

    test("rejects tokens with invalid audience", async () => {
      const mockConfig = createMockConfig(testSecret);
      const middleware = new AuthMiddleware(mockConfig);
      const handler = middleware.create();

      const token = createTestJwt(
        {
          sub: "user-123",
          aud: "wrong-audience",
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        testSecret,
      );

      const mockContext = createMockContext(`Bearer ${token}`);
      let nextCalled = false;

      await handler(mockContext, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(mockContext.json.mock.calls[0].arguments[1], 401);
      assert.deepStrictEqual(mockContext.json.mock.calls[0].arguments[0], {
        error: "Invalid audience",
      });
    });

    test("accepts valid tokens and sets user in context", async () => {
      const mockConfig = createMockConfig(testSecret);
      const middleware = new AuthMiddleware(mockConfig);
      const handler = middleware.create();

      const token = createTestJwt(
        {
          sub: "user-123",
          email: "test@example.com",
          role: "authenticated",
          aud: "authenticated",
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        testSecret,
      );

      const mockContext = createMockContext(`Bearer ${token}`);
      let nextCalled = false;

      await handler(mockContext, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(mockContext.set.mock.calls.length, 1);
      assert.strictEqual(mockContext.set.mock.calls[0].arguments[0], "user");
      assert.deepStrictEqual(mockContext.set.mock.calls[0].arguments[1], {
        id: "user-123",
        email: "test@example.com",
        role: "authenticated",
      });
    });
  });

  describe("create({ optional: true })", () => {
    test("allows unauthenticated requests and sets user to null", async () => {
      const mockConfig = createMockConfig(testSecret);
      const middleware = new AuthMiddleware(mockConfig);
      const handler = middleware.create({ optional: true });

      const mockContext = createMockContext(null);
      let nextCalled = false;

      await handler(mockContext, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(mockContext.set.mock.calls[0].arguments[0], "user");
      assert.strictEqual(mockContext.set.mock.calls[0].arguments[1], null);
    });

    test("allows requests with invalid tokens and sets user to null", async () => {
      const mockConfig = createMockConfig(testSecret);
      const middleware = new AuthMiddleware(mockConfig);
      const handler = middleware.create({ optional: true });

      const mockContext = createMockContext("Bearer invalid-token");
      let nextCalled = false;

      await handler(mockContext, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(mockContext.set.mock.calls[0].arguments[1], null);
    });

    test("still sets user when valid token is provided", async () => {
      const mockConfig = createMockConfig(testSecret);
      const middleware = new AuthMiddleware(mockConfig);
      const handler = middleware.create({ optional: true });

      const token = createTestJwt(
        {
          sub: "user-456",
          email: "optional@example.com",
          role: "authenticated",
          aud: "authenticated",
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        testSecret,
      );

      const mockContext = createMockContext(`Bearer ${token}`);
      let nextCalled = false;

      await handler(mockContext, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
      assert.deepStrictEqual(mockContext.set.mock.calls[0].arguments[1], {
        id: "user-456",
        email: "optional@example.com",
        role: "authenticated",
      });
    });
  });
});

describe("createAuthMiddleware factory", () => {
  test("creates AuthMiddleware instance", () => {
    const mockConfig = createMockConfig("test-secret");
    const middleware = createAuthMiddleware(mockConfig);
    assert.ok(middleware instanceof AuthMiddleware);
  });

  test("throws error when config is missing jwtSecret", () => {
    const mockConfig = { jwtSecret: () => undefined };
    assert.throws(() => createAuthMiddleware(mockConfig), {
      message: "JWT_SECRET environment variable is required",
    });
  });
});
